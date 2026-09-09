import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WebUIServer {
    constructor() {
        this.app = express();
        this.server = createServer(this.app);
        this.io = new Server(this.server);
        this.port = process.env.PORT || 3000;
        this.commandHandlers = {};

        // Serve static files from 'public' directory
        this.app.use(express.static(path.join(__dirname, '../public')));

        this.io.on('connection', (socket) => {
            console.log(`[WebUI] Client connected: ${socket.id}`);

            socket.on('command', async (data) => {
                const text = data.text;
                if (!text) return;
                
                console.log(`[WebUI] Command received: ${text}`);
                
                // Echo the command back as the user
                socket.emit('message', { type: 'user', text });

                const fakeCtx = {
                    message: { text },
                    chat: { id: 'local-web-ui' },
                    from: { username: 'LocalUser' },
                    reply: async (msg, opts) => {
                        socket.emit('message', { type: 'bot', text: msg, opts });
                    },
                    editMessageText: async (msg, opts) => {
                        socket.emit('message', { type: 'bot', text: msg, opts });
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

    broadcast(text) {
        this.io.emit('message', { type: 'bot', text });
    }
}

export const webUI = new WebUIServer();
