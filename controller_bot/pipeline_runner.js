import path from 'path';
import fs from 'fs';
import { loadGoogleSheet, getLeads } from '../src/sheets.js';
import { Orchestrator } from '../src/orchestrator.js';
import { WhatsAppSender } from '../src/whatsapp_sender.js';
import { CONFIG } from './config.js';

export class PipelineRunner {
    constructor(telegramBot = null, notifyChatId = null) {
        this.bot = telegramBot;
        this.chatId = notifyChatId;
        this.isProcessing = false;
    }

    async sendTelegram(msg) {
        console.log(`[PipelineRunner] ${msg}`);
        if (this.bot && this.chatId) {
            try {
                await this.bot.telegram.sendMessage(this.chatId, msg, { parse_mode: 'Markdown' });
            } catch (e) {
                console.error("[PipelineRunner] Telegram error:", e.message);
            }
        }
    }

    // Auto-detect unanalyzed leads and run full analysis + website build
    async runAnalyseAndBuild(maxLeads = 35) {
        if (this.isProcessing) {
            throw new Error("A pipeline job is already in progress!");
        }

        this.isProcessing = true;
        try {
            await this.sendTelegram(`⚙️ *[Controller] Starting Autonomous Analysis & Website Builds...*`);

            const { sheet } = await loadGoogleSheet();
            const allUnprocessed = await getLeads(sheet, null, null, []);

            if (allUnprocessed.length === 0) {
                await this.sendTelegram(`ℹ️ *[Controller] No pending unanalyzed leads found in Google Sheet.*`);
                this.isProcessing = false;
                return { processed: 0 };
            }

            const leadsToProcess = allUnprocessed.slice(0, maxLeads);
            const firstId = leadsToProcess[0].clientId;
            const lastId = leadsToProcess[leadsToProcess.length - 1].clientId;

            await this.sendTelegram(
                `📋 *Found ${allUnprocessed.length} pending leads in Sheet.*\n` +
                `🚀 *Processing Batch Range:* \`[${firstId}:${lastId}]\` (${leadsToProcess.length} leads)\n` +
                `Building responsive websites & deploying to Vercel...`
            );

            const orchestrator = new Orchestrator(this.bot, this.chatId);
            await orchestrator.processLeads(leadsToProcess);

            await this.sendTelegram(
                `🎉 *[Controller] Batch Analysis & Website Builds Complete!*\n` +
                `✅ Range \`[${firstId}:${lastId}]\` has been built, deployed to Vercel, and synced with Google Sheets.`
            );

            this.isProcessing = false;
            return { processed: leadsToProcess.length, startId: firstId, endId: lastId };
        } catch (error) {
            this.isProcessing = false;
            await this.sendTelegram(`❌ *[Controller] Error during analysis & build:* ${error.message}`);
            throw error;
        }
    }

    // Run scheduled WhatsApp dispatch wave
    async runDispatchWave(count = 18) {
        if (this.isProcessing) {
            throw new Error("A task is currently running!");
        }

        this.isProcessing = true;
        try {
            await this.sendTelegram(`📲 *[Controller] Initializing WhatsApp Dispatch Wave (Batch size: ${count})...*`);

            const { sheet } = await loadGoogleSheet();
            const rows = await sheet.getRows();

            // Find rows with Website URL ready but not yet contacted
            const readyToSend = [];
            for (const row of rows) {
                const d = row.toObject();
                const cid = parseInt(d['Client ID'], 10);
                const status = (d['Current Status'] || '').toLowerCase();
                const websiteUrl = d['Website URL'] || '';
                const phone = d['Phone'] || d['WhatsApp'] || '';

                if (cid && websiteUrl && !status.includes('contacted') && !status.includes('sent')) {
                    const reportDir = path.join(CONFIG.REPORTS_DIR, String(cid));
                    const outreachJson = path.join(reportDir, 'outreach.json');
                    if (fs.existsSync(outreachJson)) {
                        readyToSend.push(cid);
                    }
                }
            }

            if (readyToSend.length === 0) {
                await this.sendTelegram(`ℹ️ *[Controller] No pending clients ready for WhatsApp dispatch.*`);
                this.isProcessing = false;
                return { sent: 0 };
            }

            const batchIds = readyToSend.slice(0, count);
            const startId = batchIds[0];
            const endId = batchIds[batchIds.length - 1];

            await this.sendTelegram(
                `📇 *[Controller] Dispatching WhatsApp messages to ${batchIds.length} clients:* \`[${startId}:${endId}]\`\n` +
                `Safe randomized rate-limiting (30–75s delays) active...`
            );

            const sender = new WhatsAppSender(this.bot, this.chatId);
            const report = await sender.sendRange(startId, endId, { skipExport: false });

            await this.sendTelegram(
                `✅ *[Controller] WhatsApp Dispatch Wave Complete!*\n\n` +
                `📊 *Summary:*\n` +
                `• Sent Successfully: ${report.sentCount}\n` +
                `• Skipped: ${report.skippedCount}\n` +
                `• Failed: ${report.failedCount}`
            );

            this.isProcessing = false;
            return report;
        } catch (error) {
            this.isProcessing = false;
            await this.sendTelegram(`❌ *[Controller] Error during WhatsApp dispatch:* ${error.message}`);
            throw error;
        }
    }
}
