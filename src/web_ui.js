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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HISTORY_FILE = path.join(__dirname, '../web_ui_history.json');

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

        // 6. Recent Audit Events API
        this.app.get('/api/audit-logs', (req, res) => {
            try {
                const logPath = this.auditLogger.auditLogPath;
                if (!fs.existsSync(logPath)) return res.json({ success: true, events: [] });
                const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
                const events = lines.slice(-50).map(l => JSON.parse(l)).reverse();
                res.json({ success: true, events });
            } catch (e) {
                res.json({ success: false, error: e.message, events: [] });
            }
        });
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
            if (this.history.length > 100) {
                this.history = this.history.slice(this.history.length - 100);
            }
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
