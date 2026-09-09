import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

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

        this.loadHistory();

        // Serve static files from 'public' directory
        this.app.use(express.static(path.join(__dirname, '../public')));

        this.io.on('connection', (socket) => {
            console.log(`[WebUI] Client connected: ${socket.id}`);
            
            // Send existing history to the newly connected client
            socket.emit('history', this.history);

            socket.on('command', async (data) => {
                const text = data.text;
                if (!text) return;
                
                console.log(`[WebUI] Command received: ${text}`);
                
                // Echo the command back as the user
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

    emitAndSave(msgObj) {
        this.history.push(msgObj);
        this.saveHistory();
        this.io.emit('message', msgObj);
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
            console.log(`[WebUI] 🌐 Local Chat Interface running at: http://localhost:${this.port}`);
            console.log(`==================================================`);
        });
    }

    broadcast(text, opts = {}) {
        this.emitAndSave({ type: 'bot', text, opts });
    }
}

export const webUI = new WebUIServer();
