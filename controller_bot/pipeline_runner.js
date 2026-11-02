import path from 'path';
import fs from 'fs';
import PQueue from 'p-queue';
import { loadGoogleSheet, getLeads, updateLeadFields } from '../src/sheets.js';
import { Orchestrator } from '../src/orchestrator.js';
import { Scraper } from '../src/scraper.js';
import { Summarizer } from '../src/summarizer.js';
import { WebsiteBuilder } from '../src/builder.js';
import { WhatsAppSender } from '../src/whatsapp_sender.js';
import { agencyPublisher } from '../src/agency_publisher.js';
import { localityEngine } from '../src/engine/locality_engine.js';
import { CONFIG } from './config.js';

export class PipelineRunner {
    constructor(telegramBot = null, notifyChatId = null) {
        this.bot = telegramBot;
        this.chatId = notifyChatId;
        this.isProcessing = false;
        this.isAborted = false;
        // Concurrent background workers (2 parallel builds while scraper streams ahead)
        this.leadQueue = new PQueue({ concurrency: 2 });
        this.activeSender = null;
    }

    async sendTelegram(msg) {
        console.log(`[PipelineRunner] ${msg}`);
        import('../src/web_ui.js').then(({ webUI }) => webUI.broadcast(msg)).catch(()=>{});
        if (this.bot && this.chatId && this.chatId !== 'local-web-ui' && this.chatId !== 'web_ui_user') {
            try {
                await this.bot.telegram.sendMessage(this.chatId, msg, { parse_mode: 'Markdown' });
            } catch (e) {
                try {
                    await this.bot.telegram.sendMessage(this.chatId, msg);
                } catch (err) {
                    if (!err.message.includes('chat not found')) {
                        console.error("[PipelineRunner] Telegram error:", err.message);
                    }
                }
            }
        }
    }

    abort() {
        this.isAborted = true;
        this.isProcessing = false;
        this.leadQueue.clear();
        if (this.activeSender) {
            try {
                this.activeSender.close();
            } catch (e) {}
            this.activeSender = null;
        }
        console.log("[PipelineRunner] 🛑 Abort signal triggered.");
    }

    reset() {
        this.isAborted = false;
        this.isProcessing = false;
        this.leadQueue.clear();
        this.activeSender = null;
        console.log("[PipelineRunner] 🔄 State cleanly reset to original idle state.");
    }

    // Process an individual lead streamed in real-time
    async processSingleLead(leadData, loadedSheet = null) {
        if (this.isAborted) return null;

        const clientId = Number(leadData.clientId || leadData['Client ID']);
        const businessName = leadData.businessName || leadData['Business Name'] || `Client ${clientId}`;

        console.log(`\n==================================================`);
        console.log(`[PipelineRunner] ⚡ Real-Time Processing Started -> Lead #${clientId} (${businessName})`);
        console.log(`==================================================`);

        await this.sendTelegram(`⚡ *[Stream Worker] Building Live Asset for Lead #${clientId}:* \`${businessName}\``);

        const reportsDir = path.join(CONFIG.ROOT_DIR, 'reports');
        const clientReportsDir = path.join(reportsDir, String(clientId));
        if (!fs.existsSync(clientReportsDir)) {
            fs.mkdirSync(clientReportsDir, { recursive: true });
        }

        let phone = leadData.phone || leadData['Phone'] || leadData['Phone/WhatsApp'] || leadData.whatsapp || leadData['WhatsApp'] || '';
        let website = leadData.website || leadData['Existing Website'] || leadData['Website URL'] || '';
        let address = leadData.address || leadData['Address'] || leadData['Full Address'] || '';
        let rating = leadData.rating || leadData['Ratings'] || leadData['Rating'] || '';
        let reviews = leadData.reviews || leadData['Number Of Reviews'] || leadData['Total Reviews'] || '';

        // Fallback: If phone is not in stream payload, look up directly from Google Sheet row
        if (!phone && loadedSheet) {
            try {
                const rows = await loadedSheet.getRows();
                const matchedRow = rows.find(r => r.get('Client ID') == String(clientId));
                if (matchedRow) {
                    phone = matchedRow.get('Phone/WhatsApp') || matchedRow.get('Phone') || matchedRow.get('WhatsApp') || '';
                    if (!website) website = matchedRow.get('Existing Website') || matchedRow.get('Website URL') || '';
                    if (!address) address = matchedRow.get('Address') || '';
                    if (!rating) rating = matchedRow.get('Ratings') || '';
                    if (!reviews) reviews = matchedRow.get('Number Of Reviews') || '';
                }
            } catch (sheetErr) {
                console.warn(`[PipelineRunner] Sheet fallback notice for lead #${clientId}:`, sheetErr.message);
            }
        }

        try {
            const formattedLeadData = {
                'Client ID': clientId,
                'Business Name': businessName,
                'Existing Website': website,
                'Website URL': website,
                'Phone': phone,
                'WhatsApp': phone,
                'Phone/WhatsApp': phone,
                'Full Address': address,
                'Rating': rating,
                'Total Reviews': reviews
            };

            // 1. Optional web presence scrape (non-blocking failsafe)
            let scrapedData = { website: {}, maps: '', social: {}, extractedPhones: [] };
            try {
                const scraper = new Scraper();
                await scraper.init();
                scrapedData = await scraper.scrapeLead(formattedLeadData);
                await scraper.close();
            } catch (scrapeErr) {
                console.log(`[PipelineRunner] Secondary web scrape skipped/failed for Lead #${clientId} (${scrapeErr.message}). Continuing with Maps data.`);
            }

            if (this.isAborted) return null;

            // Phone strictly from Google Maps card (Commented out: do not override from website/social scraping)
            /*
            if (!phone && scrapedData?.extractedPhones?.length > 0) {
                phone = scrapedData.extractedPhones[0];
                formattedLeadData['Phone'] = phone;
                formattedLeadData['WhatsApp'] = phone;
                formattedLeadData['Phone/WhatsApp'] = phone;
                console.log(`[PipelineRunner] 📞 Discovered phone number from social/web scraping for Lead #${clientId}: ${phone}`);
                try {
                    const sObj = loadedSheet || (await loadGoogleSheet()).sheet;
                    await updateLeadFields(sObj, clientId, {
                        'Phone/WhatsApp': phone
                    });
                } catch (e) {}
            }
            */

            // 2. Summarize & Generate 14-Point Strategic Audit
            const summarizer = new Summarizer();
            const textReport = await summarizer.analyze(formattedLeadData, scrapedData);

            const auditPath = path.join(clientReportsDir, 'audit.md');
            fs.writeFileSync(auditPath, textReport, 'utf-8');

            // 3. Extract AI Hook & Update Sheet Status
            let outreachHook = "";
            const waMatch = textReport.match(/\[WHATSAPP_START\]([\s\S]*?)\[WHATSAPP_END\]/i);
            if (waMatch) {
                const lines = waMatch[1].trim().split('\n').filter(l => l.trim().length > 0);
                outreachHook = lines.slice(0, 2).join(' ').replace(/https:\/\/[^\s]+/g, '').trim();
            }

            const sheetObj = loadedSheet || (await loadGoogleSheet()).sheet;
            await updateLeadFields(sheetObj, clientId, {
                'Notes': `reports/${clientId}/audit.md`,
                'AI Outreach Hook': outreachHook,
                'Current Status': 'Analyzed'
            });

            if (this.isAborted) return null;

            // 4. Generate Website & Deploy to Vercel
            const builder = new WebsiteBuilder(this.bot, this.chatId);
            const buildResult = await builder.buildClientWebsite(clientId, false);

            await this.sendTelegram(
                `🎉 *[Stream Worker] Lead #${clientId} Built & Deployed!*\n` +
                `🏢 *Business:* \`${businessName}\`\n` +
                `🔗 *Live URL:* ${buildResult.deployedUrl}\n` +
                `📦 *Repo:* ${buildResult.githubRepoUrl}`
            );

            return { ...buildResult, clientId, businessName };
        } catch (err) {
            console.error(`[PipelineRunner] ❌ Error processing stream lead #${clientId}:`, err.message);
            await this.sendTelegram(`⚠️ *[Stream Worker] Error on Lead #${clientId} (${businessName}):* ${err.message}`);
            return { clientId, businessName, error: err.message };
        }
    }

    // High-Throughput Real-Time Streaming Pipeline
    async runStreamingScrapeAndBuild({ query, locality, city, targetLeads = 35, scraperRunner }) {
        if (this.isProcessing) {
            throw new Error("A pipeline job is already in progress!");
        }

        this.isProcessing = true;
        this.isAborted = false;
        const startTime = new Date();

        await this.sendTelegram(
            `🚀 *[Controller] Launching Concurrent Streaming Pipeline...*\n\n` +
            `📍 *Target:* \`${query}\` in \`${locality || city}\`\n` +
            `🎯 *Target Leads:* \`${targetLeads}\`\n` +
            `⚡ *Architecture:* Real-Time Concurrent Scrape & Build\n` +
            `💡 _Send /abort at any time to halt execution._`
        );

        let sheet = null;
        try {
            const sheetRes = await loadGoogleSheet();
            sheet = sheetRes.sheet;
        } catch (e) {
            console.warn("[PipelineRunner] Google Sheets pre-load notice:", e.message);
        }

        let streamedCount = 0;
        let processedCount = 0;
        const processedClientIds = [];

        try {
            // Run scraper while streaming leads into the processing queue
            await scraperRunner.runScrape({
                query,
                locality,
                city,
                targetLeads,
                onLeadScraped: (leadObj) => {
                    if (this.isAborted) return;
                    streamedCount++;
                    console.log(`[PipelineRunner] 📥 Received streamed lead #${streamedCount}: ${leadObj.businessName} (ID: ${leadObj.clientId})`);
                    
                    this.leadQueue.add(async () => {
                        if (this.isAborted) return;
                        const res = await this.processSingleLead(leadObj, sheet);
                        if (res && res.clientId && !res.error) {
                            processedClientIds.push(res.clientId);
                            processedCount++;
                        }
                    });
                }
            });

            // Intelligent Locality Auto-Hop Escape: If boundary exhaustion occurred and target is unfulfilled,
            // ask AI for adjacent micro-localities to complete the original quota!
            let currentLocality = locality.replace(/^in\s+/i, '').trim();
            let hopCount = 0;
            const maxEscapeHops = 5;

            while (streamedCount < targetLeads && hopCount < maxEscapeHops && !this.isAborted) {
                hopCount++;
                const remaining = targetLeads - streamedCount;
                console.log(`[PipelineRunner] 🔄 Boundary exhausted in "${currentLocality}" (Target unfulfilled: ${streamedCount}/${targetLeads}). Asking AI for next micro-locality to complete remaining ${remaining} leads...`);

                const cleanCity = city.includes(',') ? city.split(',')[0].trim() : city;
                const nextNearby = await localityEngine.getNextLocality(query, 'Bihar', cleanCity, currentLocality);

                if (!nextNearby || nextNearby === currentLocality) {
                    console.log(`[PipelineRunner] No additional adjacent micro-localities found. Halting escape loop.`);
                    break;
                }

                await this.sendTelegram(
                    `🧭 *[Locality Auto-Hop #${hopCount}]* Google Maps exhausted listings in \`${currentLocality}\` (Captured: ${streamedCount}/${targetLeads}).\n` +
                    `🧠 *AI Discovered Next High-Yield Area:* \`${nextNearby}, ${cleanCity}\`\n` +
                    `🎯 Resuming stream scrape to secure remaining \`${remaining}\` leads...`
                );

                currentLocality = nextNearby;
                await scraperRunner.runScrape({
                    query,
                    locality: `in ${nextNearby}`,
                    city,
                    targetLeads: remaining,
                    onLeadScraped: (leadObj) => {
                        if (this.isAborted) return;
                        streamedCount++;
                        console.log(`[PipelineRunner] 📥 Received streamed lead #${streamedCount}: ${leadObj.businessName} (ID: ${leadObj.clientId})`);

                        this.leadQueue.add(async () => {
                            if (this.isAborted) return;
                            const res = await this.processSingleLead(leadObj, sheet);
                            if (res && res.clientId && !res.error) {
                                processedClientIds.push(res.clientId);
                                processedCount++;
                            }
                        });
                    }
                });
            }

            if (this.isAborted) {
                await this.sendTelegram(`🛑 *[Controller] Pipeline was aborted by user.*`);
                return { success: false, aborted: true };
            }

            // Wait for all queued website builds to complete
            console.log(`[PipelineRunner] ⏳ Scraper finished. Waiting for remaining queued website builds to complete...`);
            await this.leadQueue.onIdle();

            // Flush and deploy any remaining unpushed sites in the batch queue
            if (agencyPublisher.batchQueue.length > 0) {
                console.log(`[PipelineRunner] 📦 Flushing remaining ${agencyPublisher.batchQueue.length} sites to production...`);
                await agencyPublisher.deployBatch(async (msg) => this.sendTelegram(msg));
            }

            const totalDurationMin = ((new Date() - startTime) / 60000).toFixed(1);

            await this.sendTelegram(
                `🏁 *[Controller] Concurrent Streaming Pipeline Complete!*\n\n` +
                `📊 *Summary:*\n` +
                `• Total Leads Scraped: ${streamedCount}\n` +
                `• Websites Built & Hosted: ${processedCount}\n` +
                `• Subdomains Active: \`*.arclanestudios.space\`\n` +
                `⏱️ *Total Duration:* ${totalDurationMin} min`
            );

            this.isProcessing = false;
            return { success: true, streamedCount, processedCount, totalDurationMin, processedClientIds };
        } catch (error) {
            this.isProcessing = false;
            if (this.isAborted) {
                await this.sendTelegram(`🛑 *[Controller] Pipeline safely aborted.*`);
                return { success: false, aborted: true };
            }
            await this.sendTelegram(`❌ *[Controller] Streaming pipeline error:* ${error.message}`);
            throw error;
        }
    }

    // Full End-to-End Pipeline (Scrape -> Audit -> Build -> Deploy -> WhatsApp Outreach)
    async runFullEndToEndPipeline({ query, locality, city, targetLeads = 1, scraperRunner }) {
        if (this.isProcessing) {
            throw new Error("A task is already in progress!");
        }

        this.isProcessing = true;
        this.isAborted = false;
        const startTime = new Date();

        await this.sendTelegram(
            `🚀 *[Controller] Starting Complete 360° Acquisition Pipeline!*\n\n` +
            `📍 *Query:* \`${query}\` (${locality || city})\n` +
            `🎯 *Target Leads:* \`${targetLeads}\`\n` +
            `⚡ *Stages:* Scrape ➔ 14-Point Audit ➔ Build Website ➔ Deploy Vercel ➔ WhatsApp Outreach\n` +
            `💡 _Send /abort at any time to cancel._`
        );

        try {
            // Step 1: Run Streaming Scrape & Build
            this.isProcessing = false; // Reset so runStreamingScrapeAndBuild can claim it
            const buildRes = await this.runStreamingScrapeAndBuild({
                query,
                locality,
                city,
                targetLeads,
                scraperRunner
            });

            if (this.isAborted || !buildRes || !buildRes.success) {
                return { success: false, aborted: true };
            }

            if (!buildRes.processedClientIds || buildRes.processedClientIds.length === 0) {
                await this.sendTelegram(`⚠️ *[Controller] No leads were processed. Skipping WhatsApp outreach.*`);
                return { success: false, reason: "No leads processed" };
            }

            const startId = Math.min(...buildRes.processedClientIds);
            const endId = Math.max(...buildRes.processedClientIds);

            // Step 2: Queue WhatsApp Outreach
            await this.sendTelegram(
                `📲 *[Controller] Website(s) Deployed! Preparing WhatsApp Outreach Wave...*\n` +
                `📇 Target Range: \`[${startId}:${endId}]\``
            );

            this.pendingDispatch = {
                startId,
                endId,
                count: buildRes.processedClientIds.length,
                timestamp: new Date()
            };

            const sender = new WhatsAppSender(this.bot, this.chatId);
            await sender.exportContacts(startId, endId);

            const totalDurationMin = ((new Date() - startTime) / 60000).toFixed(1);

            await this.sendTelegram(
                `🎉 *[Controller] 360° Acquisition Pipeline Scrape & Build Complete!*\n\n` +
                `📊 *Executive Summary:*\n` +
                `• Leads Scraped & Audited: ${buildRes.streamedCount}\n` +
                `• Live Websites Deployed: ${buildRes.processedCount}\n` +
                `⏱️ *Total Duration:* ${totalDurationMin} min\n\n` +
                `✅ Google Sheets CRM has been updated with live URLs and outreach statuses.`
            );

            const approvalMsg = `📇 *WhatsApp Outreach Batch Ready (${buildRes.processedClientIds.length} Leads: [${startId}:${endId}])*\n\n` +
                `1️⃣ Tap the vCard (.vcf) file above to save all leads into your phone contacts.\n` +
                `2️⃣ Give the **Green Signal** (type \`/launch\`) below when you are ready to begin sending messages.`;

            const replyMarkup = {
                inline_keyboard: [
                    [
                        { text: `🟢 Approve & Launch Wave`, callback_data: 'cmd_approve_dispatch' },
                        { text: '❌ Skip / Postpone', callback_data: 'cmd_dismiss_dispatch' }
                    ]
                ]
            };

            if (this.bot && this.chatId) {
                try {
                    // Send directly to Telegram API, but fall back to the Web UI wrapper
                    await this.sendTelegram(approvalMsg, replyMarkup);
                } catch (e) {}
            }

            this.isProcessing = false;
            return { success: true, buildRes, totalDurationMin, awaitingDispatchApproval: true };
        } catch (error) {
            this.isProcessing = false;
            if (this.isAborted) {
                await this.sendTelegram(`🛑 *[Controller] Full pipeline safely aborted.*`);
                return { success: false, aborted: true };
            }
            await this.sendTelegram(`❌ *[Controller] Error in 360° pipeline:* ${error.message}`);
            throw error;
        }
    }

    // Auto-detect unanalyzed leads and run batch analysis + website build (Fallback / Manual)
    async runAnalyseAndBuild(maxLeads = 35) {
        if (this.isProcessing) {
            throw new Error("A pipeline job is already in progress!");
        }

        this.isProcessing = true;
        this.isAborted = false;
        try {
            await this.sendTelegram(`⚙️ *[Controller] Starting Batch Analysis & Website Builds...*`);

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

            // Flush remaining sites in batch queue
            if (agencyPublisher.batchQueue.length > 0) {
                console.log(`[PipelineRunner] 📦 Flushing remaining ${agencyPublisher.batchQueue.length} sites to production...`);
                await agencyPublisher.deployBatch(async (msg) => this.sendTelegram(msg));
            }

            await this.sendTelegram(
                `🎉 *[Controller] Batch Analysis & Website Builds Complete!*\n` +
                `✅ Range \`[${firstId}:${lastId}]\` has been built, deployed to arclanestudios.space, and synced with Google Sheets.`
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
        this.isAborted = false;
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
                const agencyHostedUrl = d['Agency Hosted URL'] || d['Website URL'] || '';

                if (cid && agencyHostedUrl && !status.includes('contacted') && !status.includes('sent')) {
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

            this.activeSender = new WhatsAppSender(this.bot, this.chatId);
            const report = await this.activeSender.sendRange(startId, endId, { skipExport: false });
            this.activeSender = null;

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

    // Prepare WhatsApp wave: export vCard and send approval gate
    async prepareDispatchWave(count = 18) {
        if (this.isProcessing) {
            console.log('[PipelineRunner] Task already processing, skipping wave prep.');
            return null;
        }

        try {
            const { sheet } = await loadGoogleSheet();
            const rows = await sheet.getRows();

            const readyToSend = [];
            for (const row of rows) {
                const d = row.toObject();
                const cid = parseInt(d['Client ID'], 10);
                const status = (d['Current Status'] || '').toLowerCase();
                const agencyHostedUrl = d['Agency Hosted URL'] || d['Website URL'] || '';

                if (cid && agencyHostedUrl && !status.includes('contacted') && !status.includes('sent')) {
                    const reportDir = path.join(CONFIG.REPORTS_DIR, String(cid));
                    const outreachJson = path.join(reportDir, 'outreach.json');
                    if (fs.existsSync(outreachJson)) {
                        readyToSend.push(cid);
                    }
                }
            }

            if (readyToSend.length === 0) {
                await this.sendTelegram('ℹ️ *[Controller] No pending clients ready for WhatsApp dispatch.*');
                return null;
            }

            const batchIds = readyToSend.slice(0, count);
            const startId = batchIds[0];
            const endId = batchIds[batchIds.length - 1];

            // 1. Export/Send vCard first
            const sender = new WhatsAppSender(this.bot, this.chatId);
            await sender.exportContacts(startId, endId);

            // 2. Save pending dispatch metadata
            this.pendingDispatch = {
                startId,
                endId,
                count: batchIds.length,
                timestamp: new Date()
            };

            // 3. Send approval gate message
            const approvalMsg = `📇 *WhatsApp Outreach Batch Ready (${batchIds.length} Leads: [${startId}:${endId}])*\n\n` +
                `1️⃣ Tap the vCard (.vcf) file above to save all leads into your phone contacts.\n` +
                `2️⃣ Give the **Green Signal** (type \`/launch\`) below when you are ready to begin sending messages.`;

            const replyMarkup = {
                inline_keyboard: [
                    [
                        { text: `🟢 Approve & Launch Wave (${batchIds.length} msgs)`, callback_data: 'cmd_approve_dispatch' },
                        { text: '❌ Skip / Postpone', callback_data: 'cmd_dismiss_dispatch' }
                    ]
                ]
            };

            if (this.bot && this.chatId) {
                try {
                    await this.bot.telegram.sendMessage(this.chatId, approvalMsg, {
                        parse_mode: 'Markdown',
                        reply_markup: replyMarkup
                    });
                } catch (e) {}
            }

            import('../src/web_ui.js').then(({ webUI }) => {
                webUI.broadcast(approvalMsg, { reply_markup: replyMarkup });
            }).catch(() => {});

            return this.pendingDispatch;
        } catch (error) {
            console.error('[PipelineRunner] Error preparing wave approval:', error.message);
            await this.sendTelegram('❌ *[Controller] Error preparing outreach batch:* ' + error.message);
            return null;
        }
    }

    async executeApprovedDispatch() {
        if (!this.pendingDispatch) {
            throw new Error('No pending outreach batch awaiting approval!');
        }
        if (this.isProcessing) {
            throw new Error('Another pipeline task is currently running!');
        }

        const { startId, endId, count } = this.pendingDispatch;
        this.pendingDispatch = null;

        this.isProcessing = true;
        this.isAborted = false;

        try {
            await this.sendTelegram(
                `🟢 *[Controller] Green Signal Received! Dispatching WhatsApp messages to ${count} clients:* \`[${startId}:${endId}]\`\n` +
                `Safe randomized rate-limiting (30–75s delays) active...`
            );

            this.activeSender = new WhatsAppSender(this.bot, this.chatId);
            const report = await this.activeSender.sendRange(startId, endId, { skipExport: true });
            this.activeSender = null;

            await this.sendTelegram(
                '🏁 *[Controller] WhatsApp Dispatch Wave Complete!*\n\n' +
                '📊 *Summary:*\n' +
                '• Sent Successfully: ' + (report?.sentCount ?? 0) + '\n' +
                '• Skipped: ' + (report?.skippedCount ?? 0) + '\n' +
                '• Failed: ' + (report?.failedCount ?? 0)
            );

            this.isProcessing = false;
            return report;
        } catch (error) {
            this.isProcessing = false;
            await this.sendTelegram('❌ *[Controller] Error during WhatsApp dispatch:* ' + error.message);
            throw error;
        }
    }

    /**
     * Build and deploy a single Google Maps business URL immediately
     */
    async buildFromMapsUrl(mapsUrl) {
        if (this.isProcessing) {
            throw new Error("A task is already running! Please wait or send /abort.");
        }
        this.isProcessing = true;
        this.isAborted = false;

        try {
            const { instantMapsBuilder } = await import('../src/engine/instant_maps_builder.js');
            const result = await instantMapsBuilder.processMapsUrl(mapsUrl, {
                notify: (msg) => this.sendTelegram(msg),
                bot: this.telegramBot,
                chatId: this.chatId
            });

            this.isProcessing = false;
            return result;
        } catch (e) {
            this.isProcessing = false;
            throw e;
        }
    }

    /**
     * Autonomously hops localities to fulfill target leads
     */
    async runLocalityChain({ query, city = 'Patna', state = 'Bihar', targetTotal = 100, scraperRunner }) {
        if (this.isProcessing) {
            throw new Error("A pipeline job is already in progress!");
        }

        const overallStartTime = new Date();
        let totalLeadsAccumulated = 0;
        let iteration = 0;
        const maxHops = 10;

        await this.sendTelegram(
            `🌐 *[Autonomous Locality Explorer Initiated]*\n\n` +
            `📍 *Niche:* \`${query}\`\n` +
            `🏙️ *Region:* \`${city}, ${state}\`\n` +
            `🎯 *Overall Target:* \`${targetTotal}\` leads across micro-localities\n` +
            `⚡ *Self-Healing:* Auto-hops boundaries when Google Maps exhausts listings!`
        );

        while (totalLeadsAccumulated < targetTotal && iteration < maxHops && !this.isAborted) {
            iteration++;
            const nextLocality = await localityEngine.getNextLocality(query, state, city);
            const remainingNeeded = targetTotal - totalLeadsAccumulated;
            const batchTarget = Math.min(remainingNeeded, 35);

            await this.sendTelegram(
                `📍 *[Locality Hop #${iteration}] Target Area: \`${nextLocality}, ${city}\`*\n` +
                `🎯 Fetching up to ${batchTarget} leads (Need ${remainingNeeded} more to reach ${targetTotal})...`
            );

            try {
                const res = await this.runStreamingScrapeAndBuild({
                    query,
                    locality: `in ${nextLocality}`,
                    city: `${city}, ${state}`,
                    targetLeads: batchTarget,
                    scraperRunner
                });

                const scrapedInHop = res.streamedCount || 0;
                totalLeadsAccumulated += scrapedInHop;
                localityEngine.recordYield(query, nextLocality, city, state, scrapedInHop);

                await this.sendTelegram(
                    `📊 *Locality Yield for ${nextLocality}:* ${scrapedInHop} leads.\n` +
                    `📈 Total Progress: ${totalLeadsAccumulated}/${targetTotal} leads.`
                );

                if (scrapedInHop === 0) {
                    console.log(`[PipelineRunner] Zero leads in ${nextLocality}. Hopping to next locality...`);
                }
            } catch (hopErr) {
                console.error(`[PipelineRunner] Hop error on ${nextLocality}:`, hopErr.message);
                if (this.isAborted) break;
            }
        }

        const totalMins = ((new Date() - overallStartTime) / 60000).toFixed(1);
        await this.sendTelegram(
            `🏁 *[Autonomous Locality Explorer Finished]*\n\n` +
            `🎯 Total Target: ${targetTotal}\n` +
            `✅ Total Leads Secured: ${totalLeadsAccumulated}\n` +
            `⏱️ Total Exploration Duration: ${totalMins} min\n` +
            `🌐 All sites staged & active under \`*.arclanestudios.space\``
        );

        return { totalLeadsAccumulated, totalMins };
    }
}

