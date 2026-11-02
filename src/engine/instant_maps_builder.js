/**
 * Instant Google Maps Lead Builder & Deployer
 * Extracts full business metadata & photos from any Google Maps URL,
 * assigns the next free Client ID row in Google Sheets,
 * generates a 14-point strategic audit, synthesizes and deploys a custom website,
 * and updates the CRM in real-time.
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { loadGoogleSheet } from '../sheets.js';
import { mapsPhotoCrawler } from './maps_photo_crawler.js';
import { mapsPhotoPipeline } from './maps_photo_pipeline.js';
import { WebsiteBuilder } from '../builder.js';
import { Summarizer } from '../summarizer.js';
import { agencyPublisher } from '../agency_publisher.js';

export class InstantMapsBuilder {
    constructor() {
        this.isProcessing = false;
    }

    /**
     * Extracts full place details from any Google Maps URL using Playwright
     */
    async extractPlaceDetails(mapsUrl) {
        console.log(`[InstantMapsBuilder] 🧭 Opening Maps URL: ${mapsUrl}`);
        const browser = await chromium.launch({
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-infobars'
            ]
        });

        const context = await browser.newContext({
            viewport: { width: 1280, height: 850 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        const page = await context.newPage();
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        try {
            await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
            await page.waitForTimeout(3500);

            // If it's a search result list, click top place card
            const firstResult = await page.$('a[href*="https://www.google.com/maps/place/"]');
            if (firstResult && page.url().includes('/search/')) {
                try {
                    await firstResult.click();
                    await page.waitForTimeout(3000);
                } catch (e) {}
            }

            const rawDetails = await page.evaluate(() => {
                const cleanText = (str) => (str || '').replace(/[\uE000-\uF8FF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDE4F]/g, '').trim();

                const nameEl = document.querySelector('h1.DUwDvf, h1[class*="fontHeadlineLarge"], h1');
                let name = cleanText(nameEl?.innerText);
                if (!name) {
                    name = document.title.split(' - ')[0].replace('Google Maps', '').trim();
                }

                const ratingEl = document.querySelector('div.F7nice span[aria-hidden="true"], span.MW4etd');
                const rating = cleanText(ratingEl?.innerText) || '4.8';

                const reviewsEl = document.querySelector('div.F7nice span span:last-child, span.UY7F9');
                const reviewsRaw = cleanText(reviewsEl?.innerText);
                const reviews = reviewsRaw.replace(/[^0-9]/g, '') || '100';

                const categoryEl = document.querySelector('button.DkEaL, button[jsaction*="category"], span.DkEaL');
                const category = cleanText(categoryEl?.innerText) || 'Commercial';

                const addressEl = document.querySelector('button[data-item-id="address"], button[data-tooltip*="address"]');
                const address = cleanText(addressEl?.innerText);

                const phoneEl = document.querySelector('button[data-item-id^="phone:"], button[data-tooltip*="phone"]');
                const phone = cleanText(phoneEl?.innerText);

                const websiteEl = document.querySelector('a[data-item-id="authority"]');
                const website = websiteEl?.getAttribute('href') || '';

                const hoursEl = document.querySelector('button[data-item-id*="oh"], div[aria-label*="Hours"]');
                const timings = cleanText(hoursEl?.innerText) || '';

                return {
                    name: name || 'Google Maps Target',
                    rating,
                    reviews,
                    category,
                    address,
                    phone,
                    website,
                    timings,
                    finalUrl: window.location.href
                };
            });

            // Extract candidate photos
            let candidateUrls = await mapsPhotoPipeline.extractCandidatePhotosFromPage(page);
            if (candidateUrls.length < 4) {
                const photosTabBtn = await page.$('button[aria-label*="Photo"], button[aria-label*="photo"], button[jsaction*="heroHeaderImage"]');
                if (photosTabBtn) {
                    try {
                        await photosTabBtn.click();
                        await page.waitForTimeout(2500);
                        const galleryUrls = await mapsPhotoPipeline.extractCandidatePhotosFromPage(page);
                        candidateUrls = [...new Set([...candidateUrls, ...galleryUrls])];
                    } catch (e) {}
                }
            }

            await browser.close();

            return {
                ...rawDetails,
                candidateUrls
            };
        } catch (err) {
            await browser.close();
            throw err;
        }
    }

    /**
     * Determines next free Client ID from Google Sheet
     */
    async getNextClientId(sheet) {
        const rows = await sheet.getRows();
        const existingIds = rows
            .map(r => parseInt(r.get('Client ID'), 10))
            .filter(id => !isNaN(id));
        return existingIds.length > 0 ? Math.max(...existingIds) + 1 : rows.length + 1;
    }

    /**
     * Complete end-to-end processing of a Google Maps URL
     */
    async processMapsUrl(mapsUrl, { notify = console.log, bot = null, chatId = null } = {}) {
        if (this.isProcessing) {
            throw new Error("A task is already running in the background! Please wait for it to complete.");
        }

        this.isProcessing = true;

        const sendMsg = async (text) => {
            try {
                await notify(text);
            } catch (e) {}
        };

        try {
            await sendMsg(`🎯 *[Instant Builder]* Identified Google Maps target URL!\n_Extracting live business details & photography via stealth browser..._`);

            // 1. Scrape place details
            const details = await this.extractPlaceDetails(mapsUrl);
            const businessName = details.name;
            const industry = details.category || 'Commercial';
            const cleanPhone = details.phone.replace(/[^0-9]/g, '') || '';
            const address = details.address || 'Patna, Bihar';

            let cityState = 'Patna/Bihar/India';
            if (address.toLowerCase().includes('patliputra')) {
                cityState = 'Patliputra Colony/Patna/Bihar/India';
            } else if (address.toLowerCase().includes('kankarbagh')) {
                cityState = 'Kankarbagh/Patna/Bihar/India';
            } else if (address.toLowerCase().includes('boring')) {
                cityState = 'Boring Road/Patna/Bihar/India';
            }

            await sendMsg(
                `🏢 *Business Identified:* \`${businessName}\`\n` +
                `🏷️ *Category:* ${industry} | ⭐ *Rating:* ${details.rating}★ (${details.reviews} reviews)\n` +
                `📍 *Address:* ${address}\n` +
                `📞 *Phone:* ${details.phone || 'None listed'}\n\n` +
                `⚡ *Allocating next free row in Google Sheet...*`
            );

            // 2. Load Google Sheet & allocate next free row
            const { sheet, doc } = await loadGoogleSheet();
            const nextClientId = await this.getNextClientId(sheet);

            const todayFormatted = new Date().toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: '2-digit'
            });

            const newRowData = {
                'Client ID': String(nextClientId),
                'Date Added': todayFormatted,
                'Business Name': businessName,
                'Industry/Niche': industry,
                'City/State': cityState,
                'Phone/WhatsApp': cleanPhone,
                'Agency Hosted URL': '',
                'Existing Website': details.website || '',
                'AI Outreach Hook': '',
                'Current Status': 'Analyzing & Building',
                'Priority Level': '1 - Red (High)',
                'Ratings': details.rating || '4.8',
                'Number Of Reviews': String(details.reviews || '100'),
                'Timings': details.timings || '',
                'Socials': '',
                'Address': address,
                'Subdomain URL': '',
                'Email': '',
                'Maps URL': mapsUrl,
                'Notes': `reports/${nextClientId}/audit.md`
            };

            const addedRow = await sheet.addRow(newRowData);
            console.log(`[InstantMapsBuilder] ✅ Appended Lead #${nextClientId} to Google Sheet row ${addedRow.rowNumber || 'end'}`);

            await sendMsg(`📋 *Google Sheet Updated:* Allocated **Client ID #${nextClientId}**.\n\n🧠 *Generating 14-Point Strategic Audit with Gemini...*`);

            // 3. Generate 14-Point Strategic Audit
            const clientReportsDir = path.join(process.cwd(), 'reports', String(nextClientId));
            if (!fs.existsSync(clientReportsDir)) {
                fs.mkdirSync(clientReportsDir, { recursive: true });
            }

            const formattedLeadData = {
                'Client ID': nextClientId,
                'Business Name': businessName,
                'Industry/Niche': industry,
                'Address': address,
                'Phone/WhatsApp': cleanPhone,
                'Ratings': details.rating,
                'Number Of Reviews': details.reviews,
                'Existing Website': details.website,
                'Maps URL': mapsUrl
            };

            const scrapedData = {
                website: {},
                social: {},
                extractedPhones: cleanPhone ? [cleanPhone] : [],
                extractedEmails: []
            };

            const summarizer = new Summarizer();
            const auditReport = await summarizer.analyze(formattedLeadData, scrapedData);

            const auditPath = path.join(clientReportsDir, 'audit.md');
            fs.writeFileSync(auditPath, auditReport, 'utf-8');

            let waMessage = '';
            const waMatch = auditReport.match(/\[WHATSAPP_START\]([\s\S]*?)\[WHATSAPP_END\]/i);
            if (waMatch) {
                waMessage = waMatch[1].trim();
            }

            // 4. Classify Photos with Gemini Vision & Stage Assets
            await sendMsg(`📸 *Analyzing ${details.candidateUrls.length} Google Maps photos with Gemini Vision...*`);
            const classified = await mapsPhotoPipeline.classifyPhotos(details.candidateUrls, businessName, industry);

            const slug = await agencyPublisher.getSlug(businessName, nextClientId);
            const agencySiteDir = path.join(agencyPublisher.agencyPublicSitesDir, slug);
            const clientSiteDir = path.join(process.cwd(), 'generated_sites', String(nextClientId));

            await mapsPhotoPipeline.downloadAndStageAssets(classified, clientReportsDir);
            await mapsPhotoPipeline.downloadAndStageAssets(classified, agencySiteDir);
            await mapsPhotoPipeline.downloadAndStageAssets(classified, clientSiteDir);

            // 5. Website Builder with Quality Gate & Anti-Collision
            await sendMsg(`🔨 *Synthesizing high-converting website with responsive typography & anti-collision navbar...*`);
            const builder = new WebsiteBuilder(bot, chatId);
            const result = await builder.buildClientWebsite(nextClientId, true);

            // 6. Update Row Status in Google Sheet
            addedRow.set('Agency Hosted URL', result.deployedUrl);
            addedRow.set('Current Status', 'Website Built');
            addedRow.set('Notes', `reports/${nextClientId}/audit.md`);
            if (waMessage) {
                const liveUrlWa = waMessage.replace(/🔗\s*https?:\/\/[^\s]+/i, `🔗 ${result.deployedUrl}`);
                addedRow.set('AI Outreach Hook', liveUrlWa);
            }
            await addedRow.save();

            // Sync latest leads export JSON for instant dashboard refresh
            try {
                const latestJsonPath = path.join(process.cwd(), 'data_exports', 'crm_leads_latest.json');
                const allLeads = fs.existsSync(latestJsonPath) ? JSON.parse(fs.readFileSync(latestJsonPath, 'utf8')) : [];
                allLeads.push({
                    ...newRowData,
                    'Agency Hosted URL': result.deployedUrl,
                    'Current Status': 'Website Built',
                    'AI Outreach Hook': waMessage
                });
                fs.writeFileSync(latestJsonPath, JSON.stringify(allLeads, null, 2), 'utf8');
            } catch (e) {}

            this.isProcessing = false;

            const completionMsg =
                `🎉 *[Instant Builder Complete!]*\n\n` +
                `🏢 *Business:* \`${businessName}\` (${industry})\n` +
                `🆔 *Client ID:* \`#${nextClientId}\` (Saved to next free row)\n` +
                `📍 *Address:* ${address}\n` +
                `⭐ *Rating:* ${details.rating}★ (${details.reviews} reviews)\n` +
                `🔗 *Live Website:* ${result.deployedUrl}\n` +
                `📄 *Audit Link:* https://www.arclanestudios.space/reports/${nextClientId}\n\n` +
                `📋 *Ready-to-Send WhatsApp Pitch:*\n` +
                `\`\`\`\n${waMessage}\n\`\`\``;

            await sendMsg(completionMsg);

            return {
                clientId: nextClientId,
                businessName,
                deployedUrl: result.deployedUrl,
                waMessage
            };
        } catch (err) {
            this.isProcessing = false;
            console.error('[InstantMapsBuilder] Error:', err);
            await sendMsg(`❌ *[Instant Builder Failed]:* ${err.message}`);
            throw err;
        }
    }
}

export const instantMapsBuilder = new InstantMapsBuilder();

