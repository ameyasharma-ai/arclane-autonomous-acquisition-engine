import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { AuditLogger } from './engine/audit_logger.js';
import { ApprovalQueue } from './engine/approval_queue.js';
import { DeduplicationEngine } from './engine/deduplication.js';
import { FollowUpEngine } from './engine/follow_up.js';
import { loadGoogleSheet, clearCrmSheet, clearHostedCrmFields } from './sheets.js';
import { agencyPublisher } from './agency_publisher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HISTORY_FILE = path.join(__dirname, '../data/web_ui_history.json');

class WebUIServer {
    constructor() {
        this.app = express();
        this.server = createServer(this.app);
        this.io = new Server(this.server);
        this.port = process.env.PORT || 3000;
        this.commandHandlers = {};
        this.history = [];
        this.syncToTelegramHook = null;

        // Analytics & State instances
        this.auditLogger = new AuditLogger();
        this.approvalQueue = new ApprovalQueue();
        this.dedup = new DeduplicationEngine();
        this.followUp = new FollowUpEngine();

        this.app.use(express.json());
        this.loadHistory();

        // Serve static dashboard files from 'public' directory
        this.app.use(express.static(path.join(__dirname, '../public')));

        // Serve plan documents & HTML roadmaps from 'plan' directory
        this.app.use('/plan', express.static(path.join(__dirname, '../plan')));

        // Serve local generated client demo websites
        this.app.use('/sites', express.static(path.join(__dirname, '../generated_sites')));

        // REST API endpoints for the Real-Time Sales & Pipeline Analytics Dashboard
        this.setupApiRoutes();

        this.io.on('connection', async (socket) => {
            console.log(`[WebUI] Client connected: ${socket.id}`);
            
            // Send existing history & live metrics to the newly connected client
            socket.emit('history', this.history);
            try {
                const liveMetrics = await this.auditLogger.getAnalytics();
                socket.emit('metrics_update', liveMetrics);
            } catch (e) {}

            socket.on('command', async (data) => {
                const text = data.text;
                if (!text) return;
                
                console.log(`[WebUI] Command received: ${text}`);
                this.emitAndSave({ type: 'user', text });

                const fakeCtx = {
                    message: { text },
                    chat: { id: 'local-web-ui' },
                    from: { username: 'LocalUser' },
                    reply: async (msg, opts) => {
                        this.emitAndSave({ type: 'bot', text: msg, opts });
                        if (this.syncToTelegramHook) {
                            this.syncToTelegramHook(msg, opts);
                        }
                    },
                    editMessageText: async (msg, opts) => {
                        this.emitAndSave({ type: 'bot', text: msg, opts });
                        if (this.syncToTelegramHook) {
                            this.syncToTelegramHook(msg, opts);
                        }
                    },
                    editMessageReplyMarkup: async () => {},
                    answerCbQuery: async () => {}
                };

                let handled = false;
                if (text.startsWith('action:')) {
                    const actionName = text.replace('action:', '');
                    try {
                        fakeCtx.callbackQuery = { data: actionName };
                        if (this.commandHandlers['__action']) {
                            await this.commandHandlers['__action'](actionName, fakeCtx);
                            handled = true;
                        }
                    } catch (e) {
                        fakeCtx.reply(`❌ Web UI Action Error: ${e.message}`);
                        handled = true;
                    }
                } else {
                    const cmdName = text.split(' ')[0].replace('/', '');
                    if (this.commandHandlers[cmdName]) {
                        try {
                            await this.commandHandlers[cmdName](fakeCtx);
                        } catch (e) {
                            fakeCtx.reply(`❌ Web UI Error: ${e.message}`);
                        }
                        handled = true;
                    }
                }
                
                if (!handled && text.startsWith('/')) {
                    fakeCtx.reply("Command not recognized by Web UI router.");
                }
            });

            socket.on('clear_history', () => {
                console.log(`[WebUI] Clear history requested by ${socket.id}`);
                this.clearHistory();
            });

            socket.on('disconnect', () => {
                console.log(`[WebUI] Client disconnected: ${socket.id}`);
            });
        });
    }

    setupApiRoutes() {
        // 1. Live Funnel & Sales Metrics API
        this.app.get('/api/analytics', async (req, res) => {
            const metrics = await this.auditLogger.getAnalytics();
            res.json({ success: true, metrics });
        });

        // 1b. Force refresh metrics from CRM Sheet
        this.app.post('/api/refresh-metrics', async (req, res) => {
            const metrics = await this.auditLogger.getAnalytics();
            this.io.emit('metrics_update', metrics);
            res.json({ success: true, metrics });
        });

        // 2. Human Approval Queue API
        this.app.get('/api/approval-queue', (req, res) => {
            const queue = this.approvalQueue.loadQueue();
            res.json({ success: true, queue });
        });

        // 3. Approve a queued message
        this.app.post('/api/approve', (req, res) => {
            const { leadId, editedMessage } = req.body;
            const approved = this.approvalQueue.approve(leadId, 'Dashboard User', editedMessage);
            if (approved) {
                res.json({ success: true, item: approved });
            } else {
                res.status(404).json({ success: false, error: 'Lead not found in queue' });
            }
        });

        // 3b. Approve ALL pending messages in 1 click
        this.app.post('/api/approve-all', (req, res) => {
            const count = this.approvalQueue.approveAll('Dashboard Operator');
            res.json({ success: true, count });
        });

        // 3c. Purge test mock leads
        this.app.post('/api/purge-dummies', (req, res) => {
            const remaining = this.approvalQueue.purgeDummyLeads();
            res.json({ success: true, remaining });
        });

        // 4. Reject a queued message
        this.app.post('/api/reject', (req, res) => {
            const { leadId, reason } = req.body;
            const rejected = this.approvalQueue.reject(leadId, reason);
            res.json({ success: true, item: rejected });
        });

        // 4b. Restore rejected or archived lead back to pending
        this.app.post('/api/restore', (req, res) => {
            const { leadId } = req.body;
            const restored = this.approvalQueue.restore(leadId);
            res.json({ success: true, item: restored });
        });

        // 4c. Update/Customize pitch copy manually
        this.app.post('/api/update-message', (req, res) => {
            const { leadId, message } = req.body;
            const updated = this.approvalQueue.updateMessage(leadId, message);
            res.json({ success: true, item: updated });
        });

        // 4d. Clear all rejected items permanently
        this.app.post('/api/purge-rejected', (req, res) => {
            const remaining = this.approvalQueue.purgeRejected();
            res.json({ success: true, remaining });
        });

        // 5. Active Follow-Up Schedules API
        this.app.get('/api/followups', (req, res) => {
            const schedules = this.followUp.loadSchedules();
            res.json({ success: true, schedules });
        });

        // 6. Scheduler Automation Persistent State API
        this.app.get('/api/scheduler/status', (req, res) => {
            let isAutoRunning = true;
            try {
                const statePath = path.join(__dirname, '../plan/engine_state.json');
                if (fs.existsSync(statePath)) {
                    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
                    if (typeof state.isAutoRunning === 'boolean') {
                        isAutoRunning = state.isAutoRunning;
                    }
                }
            } catch (e) {}
            res.json({ success: true, isAutoRunning });
        });

        this.app.post('/api/scheduler/toggle', async (req, res) => {
            const { isAutoRunning } = req.body;
            try {
                const statePath = path.join(__dirname, '../plan/engine_state.json');
                let state = {};
                if (fs.existsSync(statePath)) {
                    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
                }
                state.isAutoRunning = !!isAutoRunning;
                state.lastUpdated = new Date().toISOString();
                fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');

                // Broadcast change to all connected clients
                this.io.emit('scheduler_state_changed', { isAutoRunning: state.isAutoRunning });

                // Also trigger internal bot command if registered
                const cmd = state.isAutoRunning ? 'start_auto' : 'pause_auto';
                if (this.commandHandlers[cmd]) {
                    const fakeCtx = {
                        chat: { id: 'local-web-ui' },
                        reply: async (msg) => this.emitAndSave({ type: 'bot', text: msg })
                    };
                    await this.commandHandlers[cmd](fakeCtx);
                }

                res.json({ success: true, isAutoRunning: state.isAutoRunning });
            } catch (e) {
                res.status(500).json({ success: false, error: e.message });
            }
        });

        // 7. Execute Command API (e.g. from UI buttons or scripts)
        this.app.post('/api/command', async (req, res) => {
            const { text } = req.body;
            if (!text) return res.status(400).json({ success: false, error: 'Command text is required' });
            
            console.log(`[WebUI API] Command received: ${text}`);
            this.emitAndSave({ type: 'user', text });

            const fakeCtx = {
                message: { text },
                chat: { id: 'local-web-ui' },
                from: { username: 'LocalUser' },
                reply: async (msg, opts) => {
                    this.emitAndSave({ type: 'bot', text: msg, opts });
                    if (this.syncToTelegramHook) {
                        this.syncToTelegramHook(msg, opts);
                    }
                },
                editMessageText: async (msg, opts) => {
                    this.emitAndSave({ type: 'bot', text: msg, opts });
                    if (this.syncToTelegramHook) {
                        this.syncToTelegramHook(msg, opts);
                    }
                },
                editMessageReplyMarkup: async () => {},
                answerCbQuery: async () => {}
            };

            let handled = false;
            if (text.startsWith('action:')) {
                const actionName = text.replace('action:', '');
                try {
                    fakeCtx.callbackQuery = { data: actionName };
                    if (this.commandHandlers['__action']) {
                        await this.commandHandlers['__action'](actionName, fakeCtx);
                        handled = true;
                    }
                } catch (e) {
                    fakeCtx.reply(`❌ Web UI Action Error: ${e.message}`);
                    handled = true;
                }
            } else {
                const cmdName = text.split(' ')[0].replace('/', '');
                if (this.commandHandlers[cmdName]) {
                    try {
                        await this.commandHandlers[cmdName](fakeCtx);
                    } catch (e) {
                        fakeCtx.reply(`❌ Web UI Error: ${e.message}`);
                    }
                    handled = true;
                }
            }

            res.json({ success: true, handled });
        });

        // 8. Clear Chat History API
        this.app.post('/api/chat/clear', (req, res) => {
            this.clearHistory();
            res.json({ success: true, message: 'Chat history cleared' });
        });

        // 9. Clear All Scraped Places & CRM Leads (Locally & Online)
        this.app.post('/api/clear-places-crm', async (req, res) => {
            try {
                console.log('[WebUI] 🧹 Clear Scraped Places & CRM requested');
                
                // A. Local files
                const placesFiles = [
                    path.join(__dirname, '../scraped_places.txt'),
                    path.join(__dirname, '../scraper/scraped_places.txt')
                ];
                for (const pf of placesFiles) {
                    if (fs.existsSync(pf)) {
                        fs.writeFileSync(pf, '');
                    }
                }

                // Clean reports directory client folders
                const reportsDir = path.join(__dirname, '../reports');
                if (fs.existsSync(reportsDir)) {
                    const entries = fs.readdirSync(reportsDir, { withFileTypes: true });
                    for (const entry of entries) {
                        if (entry.isDirectory() && !entry.name.startsWith('.')) {
                            fs.rmSync(path.join(reportsDir, entry.name), { recursive: true, force: true });
                        }
                    }
                }

                // B. Online CRM Sheet
                let crmDeleted = 0;
                try {
                    const { sheet } = await loadGoogleSheet();
                    crmDeleted = await clearCrmSheet(sheet);
                } catch (sheetErr) {
                    console.error('[WebUI] Google Sheet clear note:', sheetErr.message);
                }

                // Refresh metrics & notify
                try {
                    const m = await this.auditLogger.getAnalytics();
                    this.io.emit('metrics_update', m);
                } catch (e) {}

                this.broadcast(`🧹 *[Admin] All scraped places and CRM leads cleared locally & online!* (${crmDeleted} rows removed from CRM)`);
                res.json({ success: true, crmDeleted });
            } catch (err) {
                console.error('[WebUI] Error in clear-places-crm:', err);
                res.status(500).json({ success: false, error: err.message });
            }
        });

        // 10. Clear Hosted Websites & Reset Agency to Normal Baseline
        this.app.post('/api/clear-hosted-sites', async (req, res) => {
            try {
                console.log('[WebUI] 🧹 Clear Hosted Websites requested');

                // A. Local generated_sites
                const genDir = path.join(__dirname, '../generated_sites');
                if (fs.existsSync(genDir)) {
                    const entries = fs.readdirSync(genDir, { withFileTypes: true });
                    for (const entry of entries) {
                        if (entry.isDirectory()) {
                            fs.rmSync(path.join(genDir, entry.name), { recursive: true, force: true });
                        }
                    }
                }

                // B. Remove hosted sites in web-dev-agency & push baseline to GitHub
                await agencyPublisher.clearHostedWebsites((msg) => this.broadcast(msg));

                // C. Clear hosted domains and reset status in Online CRM
                let crmUpdated = 0;
                try {
                    const { sheet } = await loadGoogleSheet();
                    crmUpdated = await clearHostedCrmFields(sheet);
                } catch (sheetErr) {
                    console.error('[WebUI] CRM hosted fields reset note:', sheetErr.message);
                }

                // Refresh metrics
                try {
                    const m = await this.auditLogger.getAnalytics();
                    this.io.emit('metrics_update', m);
                } catch (e) {}

                this.broadcast(`✅ *[Admin] Hosted websites cleared! Agency website reset to clean baseline. (${crmUpdated} leads updated in CRM)*`);
                res.json({ success: true, crmUpdated });
            } catch (err) {
                console.error('[WebUI] Error in clear-hosted-sites:', err);
                res.status(500).json({ success: false, error: err.message });
            }
        });
    }

    clearHistory() {
        this.history = [];
        this.saveHistory();
        this.io.emit('history', []);
    }

    loadHistory() {
        try {
            if (fs.existsSync(HISTORY_FILE)) {
                const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
                this.history = JSON.parse(data);
            } else {
                this.history = [{
                    type: 'bot',
                    text: 'Welcome to the Local Web UI! I am connected to the Controller Bot.\nYou can send commands directly from here without needing Telegram.',
                    opts: {
                        reply_markup: {
                            inline_keyboard: [[{text:'/start',callback_data:'cmd_start'},{text:'/status',callback_data:'cmd_status'},{text:'/today',callback_data:'cmd_today'}]]
                        }
                    }
                }];
                this.saveHistory();
            }
        } catch (e) {
            console.error('[WebUI] Failed to load history:', e);
            this.history = [];
        }
    }

    saveHistory() {
        try {
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.history, null, 2));
        } catch (e) {
            console.error('[WebUI] Failed to save history:', e);
        }
    }

    async emitAndSave(msgObj) {
        this.history.push(msgObj);
        this.saveHistory();
        this.io.emit('message', msgObj);
        try {
            const m = await this.auditLogger.getAnalytics();
            this.io.emit('metrics_update', m);
        } catch (e) {}
    }

    registerCommand(cmd, handler) {
        this.commandHandlers[cmd] = handler;
    }

    registerActionHandler(handler) {
        this.commandHandlers['__action'] = handler;
    }

    start() {
        this.server.listen(this.port, () => {
            console.log(`==================================================`);
            console.log(`[WebUI] 🌐 Sales OS & Controller running at: http://localhost:${this.port}`);
            console.log(`==================================================`);
        });
    }

    broadcast(text, opts = {}) {
        this.emitAndSave({ type: 'bot', text, opts });
    }
}

export const webUI = new WebUIServer();
