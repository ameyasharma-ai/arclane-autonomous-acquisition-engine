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
import { photoPolicy } from './engine/photo_policy.js';
import { WebsiteBuilder } from './builder.js';

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
        this.scheduler = null;
        this.currentRunningTask = null;

        // Analytics & State instances
        this.auditLogger = new AuditLogger();
        this.approvalQueue = new ApprovalQueue();
        this.dedup = new DeduplicationEngine();
        this.followUp = new FollowUpEngine();

        // Security Middlewares & Headers
        this.app.use((req, res, next) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'SAMEORIGIN');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
            next();
        });

        this.app.use(express.json({ limit: '2mb' }));
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

            socket.emit('process_status', this.getBusyStatus());

            socket.on('command', async (data) => {
                const text = data.text;
                if (!text) return;
                
                console.log(`[WebUI] Command received: ${text}`);

                const rawCmd = text.split(' ')[0].replace('/', '').trim().toLowerCase();
                const isControlOrStatus = ['status', 'today', 'help', 'start', 'abort', 'stop', 'reset_plan', 'resume_plan', 'coverage', 'view_plan', 'metrics', 'fix', 'build', 'fix_lead', 'build_lead', 'rebuild', 'build_url'].includes(rawCmd);
                const isHeavyTask = !text.startsWith('action:') && !isControlOrStatus && text.startsWith('/');

                const busyInfo = this.getBusyStatus();
                if (busyInfo.isBusy && isHeavyTask) {
                    this.emitAndSave({ type: 'user', text });
                    const rejectMsg = `⚠️ *[Command Rejected]* An automated process is currently active:\n` +
                                      `• *Active Task:* \`${busyInfo.reason}\`\n\n` +
                                      `_Please wait for the current run to finish, or send \`/abort\` to halt it before starting a new command._`;
                    this.emitAndSave({ type: 'bot', text: rejectMsg });
                    this.io.emit('process_status', busyInfo);
                    return;
                }

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

                const isQuickQuery = ['status', 'help', 'metrics', 'today', 'coverage', 'view_plan'].includes(rawCmd);
                if (!isQuickQuery && !text.startsWith('action:')) {
                    this.currentRunningTask = text;
                    this.io.emit('process_status', this.getBusyStatus());
                }

                try {
                    let handled = false;
                    const mapsRegex = /(https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)[^\s]+)/i;
                    const mapsMatch = text.match(mapsRegex);

                    if (mapsMatch) {
                        try {
                            const { instantMapsBuilder } = await import('./engine/instant_maps_builder.js');
                            await instantMapsBuilder.processMapsUrl(mapsMatch[1], {
                                notify: (msg) => fakeCtx.reply(msg),
                                bot: this.telegramBot,
                                chatId: 'local-web-ui'
                            });
                        } catch (mapsErr) {
                            fakeCtx.reply(`❌ Build from URL failed: ${mapsErr.message}`);
                        }
                        handled = true;
                    } else if (text.startsWith('action:')) {
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
                        const cmdName = (rawCmd === 'stream_scrape') ? 'trigger_stream' : rawCmd;
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
                } finally {
                    if (!isQuickQuery && !text.startsWith('action:')) {
                        this.currentRunningTask = null;
                        this.io.emit('process_status', this.getBusyStatus());
                        this.io.emit('command_finished', { command: text });
                        this.io.emit('queue_updated');
                        this.io.emit('data_updated', { command: text });
                        try {
                            const m = await this.auditLogger.getAnalytics(true);
                            this.io.emit('metrics_update', m);
                        } catch (e) {}
                    }
                }

                // Broadcast updated busy status after triggering
                setTimeout(() => {
                    this.io.emit('process_status', this.getBusyStatus());
                }, 500);
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

        // 6a. Persistent Photo Policy Strategy API
        this.app.get('/api/photo-policy', (req, res) => {
            res.json({
                success: true,
                mode: photoPolicy.getMode(),
                leadOverrides: photoPolicy.leadOverrides
            });
        });

        this.app.post('/api/photo-policy/toggle', (req, res) => {
            const { mode } = req.body;
            try {
                const updatedMode = photoPolicy.setMode(mode);
                this.io.emit('photo_policy_changed', { mode: updatedMode });
                this.broadcast(`📸 *[Photo Policy]* Global image sourcing set to: \`${updatedMode}\``);
                res.json({ success: true, mode: updatedMode });
            } catch (e) {
                res.status(400).json({ success: false, error: e.message });
            }
        });

        this.app.post('/api/photo-policy/lead-toggle', async (req, res) => {
            const { clientId, source } = req.body;
            try {
                if (!clientId) return res.status(400).json({ success: false, error: 'clientId is required' });
                const updatedSource = photoPolicy.setLeadPhotoOverride(clientId, source);
                
                // Re-build lead website with the updated photo preference
                this.broadcast(`🔄 *[Photo Policy]* Rebuilding Lead #${clientId} with ${updatedSource === 'stock' ? 'Curated Stock' : 'Authentic Maps'} photos...`);
                const builder = new WebsiteBuilder();
                const buildRes = await builder.buildClientWebsite(Number(clientId), true);
                
                this.io.emit('lead_photo_toggled', { clientId, source: updatedSource, deployedUrl: buildRes.deployedUrl });
                res.json({ success: true, clientId, source: updatedSource, deployedUrl: buildRes.deployedUrl });
            } catch (e) {
                res.status(500).json({ success: false, error: e.message });
            }
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

        // 6b. Process & Concurrency Lock Status API
        this.app.get('/api/process/status', (req, res) => {
            res.json({ success: true, ...this.getBusyStatus() });
        });

        // 7. Execute Command API (e.g. from UI buttons or scripts)
        this.app.post('/api/command', async (req, res) => {
            const { text } = req.body;
            if (!text) return res.status(400).json({ success: false, error: 'Command text is required' });
            
            console.log(`[WebUI API] Command received: ${text}`);

            const rawCmd = text.split(' ')[0].replace('/', '').trim().toLowerCase();
            const isControlOrStatus = ['status', 'today', 'help', 'start', 'abort', 'stop', 'reset_plan', 'resume_plan', 'coverage', 'view_plan', 'metrics'].includes(rawCmd);
            const isHeavyTask = !text.startsWith('action:') && !isControlOrStatus && text.startsWith('/');

            const busyInfo = this.getBusyStatus();
            if (busyInfo.isBusy && isHeavyTask) {
                this.emitAndSave({ type: 'user', text });
                const rejectMsg = `⚠️ *[Command Rejected]* An automated process is currently active:\n` +
                                  `• *Active Task:* \`${busyInfo.reason}\`\n\n` +
                                  `_Please wait for the current run to finish, or send \`/abort\` to halt it before starting a new command._`;
                this.emitAndSave({ type: 'bot', text: rejectMsg });
                this.io.emit('process_status', busyInfo);
                return res.status(409).json({ success: false, error: 'Process is currently busy', ...busyInfo });
            }

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

    setScheduler(scheduler) {
        this.scheduler = scheduler;
    }

    isBusy() {
        if (!this.scheduler) return false;
        const scraperBusy = Boolean(this.scheduler.scraperRunner && this.scheduler.scraperRunner.isRunning);
        const pipelineBusy = Boolean(this.scheduler.pipelineRunner && this.scheduler.pipelineRunner.isProcessing);
        return scraperBusy || pipelineBusy;
    }

    getBusyStatus() {
        if (this.currentRunningTask) {
            return { isBusy: true, reason: `Active task: ${this.currentRunningTask}` };
        }
        if (!this.scheduler) return { isBusy: false, reason: '' };
        const scraperBusy = Boolean(this.scheduler.scraperRunner && this.scheduler.scraperRunner.isRunning);
        const pipelineBusy = Boolean(this.scheduler.pipelineRunner && this.scheduler.pipelineRunner.isProcessing);
        if (scraperBusy && pipelineBusy) return { isBusy: true, reason: 'Scraping and Website Building actively running' };
        if (scraperBusy) return { isBusy: true, reason: 'Google Maps scraping actively running' };
        if (pipelineBusy) return { isBusy: true, reason: 'Website building & deployment actively running' };
        return { isBusy: false, reason: '' };
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
