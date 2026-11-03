import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { CONFIG } from './config.js';

export class ScraperRunner {
    constructor(telegramBot = null, notifyChatId = null) {
        this.bot = telegramBot;
        this.chatId = notifyChatId;
        this.activeProcess = null;
        this.isRunning = false;
    }

    async sendTelegram(msg) {
        console.log(`[ScraperRunner] ${msg}`);
        import('../src/web_ui.js').then(({ webUI }) => webUI.broadcast(msg)).catch(()=>{});
        if (this.bot && this.chatId && this.chatId !== 'local-web-ui' && this.chatId !== 'web_ui_user') {
            try {
                await this.bot.telegram.sendMessage(this.chatId, msg, { parse_mode: 'Markdown' });
            } catch (e) {
                if (!e.message.includes('chat not found')) {
                    console.error("[ScraperRunner] Telegram notification error:", e.message);
                }
            }
        }
    }

    async runScrape({ query, locality, city, targetLeads = 35, onLeadScraped = null }) {
        if (this.isRunning) {
            throw new Error("A scraper task is already currently running!");
        }

        const scraperScriptPath = path.join(CONFIG.SCRAPER_DIR, 'scraper_no_website.py');
        if (!fs.existsSync(scraperScriptPath)) {
            throw new Error(`Scraper script not found at: ${scraperScriptPath}`);
        }

        this.isRunning = true;
        const startTime = new Date();

        await this.sendTelegram(
            `🔍 *[Controller] Starting Autonomous Lead Scraping...*\n\n` +
            `📍 *Query:* \`${query}\`\n` +
            `🏙️ *Location:* \`${locality || city}\`\n` +
            `🎯 *Target Leads:* \`${targetLeads}\`\n` +
            `⏰ *Started:* ${startTime.toLocaleTimeString('en-IN', { timeZone: CONFIG.TIMEZONE })}\n` +
            `${onLeadScraped ? `⚡ *Streaming Mode:* Real-time website build enabled` : ''}`
        );

        return new Promise((resolve, reject) => {
            const args = [
                scraperScriptPath,
                '--query', query,
                '--locality', locality || `in ${city}`,
                '--city', city,
                '--leads', String(targetLeads)
            ];

            // Robust Python resolution: prefer environment variable or Anaconda python where playwright is installed
            let pythonCmd = process.env.PYTHON_BIN || process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');
            const anacondaPath = 'C:\\Users\\Ameya Sharma\\anaconda3\\python.exe';
            if (process.platform === 'win32' && !process.env.PYTHON_BIN && !process.env.PYTHON_PATH && fs.existsSync(anacondaPath)) {
                pythonCmd = anacondaPath;
            }
            
            console.log(`[ScraperRunner] Spawning: ${pythonCmd} ${args.join(' ')} in ${CONFIG.SCRAPER_DIR}`);

            this.activeProcess = spawn(pythonCmd, args, {
                cwd: CONFIG.SCRAPER_DIR,
                env: { ...process.env, PYTHONUNBUFFERED: "1" }
            });

            let stdoutData = "";
            let stderrData = "";
            let lineBuffer = "";

            this.activeProcess.stdout.on('data', (data) => {
                const str = data.toString();
                stdoutData += str;
                process.stdout.write(str);

                if (onLeadScraped) {
                    lineBuffer += str;
                    const lines = lineBuffer.split('\n');
                    lineBuffer = lines.pop(); // keep last incomplete line

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.includes('[STREAM_LEAD]:')) {
                            const jsonStr = trimmed.split('[STREAM_LEAD]:')[1].trim();
                            try {
                                const leadObj = JSON.parse(jsonStr);
                                onLeadScraped(leadObj);
                            } catch (parseErr) {
                                console.error("[ScraperRunner] Error parsing streamed lead JSON:", parseErr.message);
                            }
                        }
                    }
                }
            });

            this.activeProcess.stderr.on('data', (data) => {
                const str = data.toString();
                stderrData += str;
                process.stderr.write(str);
            });

            this.activeProcess.on('close', async (code) => {
                this.isRunning = false;
                this.activeProcess = null;
                const durationMinutes = ((new Date() - startTime) / 60000).toFixed(1);

                if (code === 0) {
                    await this.sendTelegram(
                        `✅ *[Controller] Scraping Complete!*\n\n` +
                        `📊 *Results:* Extracted qualified leads into Google Sheets.\n` +
                        `⏱️ *Duration:* ${durationMinutes} min\n` +
                        `🚀 *Next Step:* Pipeline analysis & website build will begin shortly.`
                    );
                    resolve({ success: true, stdout: stdoutData, durationMinutes });
                } else {
                    const errSnippet = stderrData.slice(-300) || stdoutData.slice(-300) || `Exited with code ${code}`;
                    await this.sendTelegram(`⚠️ *[Controller] Scraper finished with notice/code ${code}:*\n\`\`\`\n${errSnippet}\n\`\`\``);
                    resolve({ success: false, code, error: errSnippet, durationMinutes });
                }
            });

            this.activeProcess.on('error', async (err) => {
                this.isRunning = false;
                this.activeProcess = null;
                await this.sendTelegram(`❌ *[Controller] Scraper process error:* ${err.message}`);
                reject(err);
            });
        });
    }

    stop() {
        if (this.activeProcess) {
            this.activeProcess.kill('SIGTERM');
            this.isRunning = false;
            this.activeProcess = null;
            return true;
        }
        return false;
    }
}
