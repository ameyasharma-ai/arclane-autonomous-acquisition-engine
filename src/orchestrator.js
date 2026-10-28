import fs from 'fs';
import path from 'path';
import { Scraper } from './scraper.js';
import { Summarizer } from './summarizer.js';
import { updateLeadFields } from './sheets.js';
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
            const businessName = lead.businessName || (lead.data && lead.data['Business Name']) || `Client ${clientId}`;
            const leadData = lead.data || {
                'Client ID': clientId,
                'Business Name': businessName,
                'Website URL': lead.websiteUrl || '',
                'Phone': lead.phone || '',
                'WhatsApp': lead.phone || '',
                'Phone/WhatsApp': lead.phone || '',
                'Full Address': lead.fullAddress || '',
                'Rating': lead.rating || '',
                'Total Reviews': lead.totalReviews || ''
            };
            const leadSheet = lead.sheet || (lead.rawRow && lead.rawRow._sheet);
            
            await this.sendStatus(`[${count}/${leads.length}] Processing ${businessName} (ID: ${clientId})...`);
            
            try {
                // 1. Scrape
                const scrapedData = await this.scraper.scrapeLead(leadData);
                
                // 2. Summarize & Generate 14-Point Strategy
                const textReport = await this.summarizer.analyze(leadData, scrapedData);
                
                // 3. Save to local reports/<clientId>/ dir
                const clientReportsDir = path.join(this.reportsDir, String(clientId));
                if (!fs.existsSync(clientReportsDir)) {
                    fs.mkdirSync(clientReportsDir, { recursive: true });
                }
                const auditPath = path.join(clientReportsDir, 'audit.md');
                fs.writeFileSync(auditPath, textReport, 'utf-8');

                // Extract AI Outreach Hook from WhatsApp message
                let outreachHook = "";
                const waMatch = textReport.match(/\[WHATSAPP_START\]([\s\S]*?)\[WHATSAPP_END\]/i);
                if (waMatch) {
                    const lines = waMatch[1].trim().split('\n').filter(l => l.trim().length > 0);
                    outreachHook = lines.slice(0, 2).join(' ').replace(/https:\/\/[^\s]+/g, '').trim();
                }

                // 4. Update Google Sheet (Notes, AI Outreach Hook, Current Status)
                if (leadSheet) {
                    await updateLeadFields(leadSheet, clientId, {
                        'Notes': `reports/${clientId}/audit.md`,
                        'AI Outreach Hook': outreachHook,
                        'Current Status': 'Analyzed'
                    });
                }
                
                await this.sendStatus(`✅ Strategy report generated for ${businessName} (ID: ${clientId})\nSaved to \`reports/${clientId}/audit.md\``);

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
