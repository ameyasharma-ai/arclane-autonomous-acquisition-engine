import fs from 'fs';
import path from 'path';
import { Scraper } from './scraper.js';
import { Summarizer } from './summarizer.js';
import { updateLeadNotes } from './sheets.js';
import { WebsiteBuilder } from './builder.js';

export class Orchestrator {
    constructor(telegramBot, chatId) {
        this.telegramBot = telegramBot;
        this.chatId = chatId;
        this.scraper = new Scraper();
        this.summarizer = new Summarizer();
        this.reportsDir = path.join(process.cwd(), 'reports');
        this.state = 'RUNNING'; // Can be 'RUNNING', 'PAUSED', or 'STOPPED'
        
        if (!fs.existsSync(this.reportsDir)) {
            fs.mkdirSync(this.reportsDir, { recursive: true });
        }
    }

    async sendStatus(msg) {
        console.log(`[Status] ${msg}`);
        if (this.telegramBot && this.chatId) {
            try {
                await this.telegramBot.telegram.sendMessage(this.chatId, msg);
            } catch (e) {
                console.error("Failed to send telegram message:", e.message);
            }
        }
    }

    async processLeads(leads) {
        await this.sendStatus(`Starting analysis for ${leads.length} leads...`);
        await this.scraper.init();

        let count = 0;
        for (const lead of leads) {
            // Check state before starting the next lead
            while (this.state === 'PAUSED') {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            if (this.state === 'STOPPED') {
                await this.sendStatus(`🛑 Analysis stopped by user.`);
                break;
            }

            count++;
            const clientId = lead.clientId;
            const businessName = lead.data['Business Name'] || `Client ${clientId}`;
            
            await this.sendStatus(`[${count}/${leads.length}] Processing ${businessName} (ID: ${clientId})...`);
            
            try {
                // 1. Scrape
                const scrapedData = await this.scraper.scrapeLead(lead.data);
                
                // 2. Summarize & Generate 14-Point Strategy
                const textReport = await this.summarizer.analyze(lead.data, scrapedData);
                
                // 3. Save to local reports dir
                const reportFileName = `${clientId}.txt`;
                const reportPath = path.join(this.reportsDir, reportFileName);
                fs.writeFileSync(reportPath, textReport, 'utf-8');
                
                // 4. Update Google Sheet Notes column
                await updateLeadNotes(lead, reportFileName);
                
                await this.sendStatus(`✅ Strategy report generated for ${businessName} (ID: ${clientId})`);

                // 5. Automatically initiate Website Build & Hosting sequentially
                try {
                    const builder = new WebsiteBuilder(this.telegramBot, this.chatId);
                    await builder.buildClientWebsite(clientId, false);
                } catch (buildErr) {
                    console.error(`Website auto-build error for ${businessName}:`, buildErr);
                    await this.sendStatus(`⚠️ Website build failed for ${businessName}: ${buildErr.message}`);
                }

            } catch (error) {
                console.error(`Error processing client ${clientId}:`, error);
                await this.sendStatus(`❌ Failed to process ${businessName}: ${error.message}`);
            }
        }

        await this.scraper.close();
        await this.sendStatus(`🎉 Pipeline complete! Processed & built websites for ${leads.length} leads.`);
    }
}
