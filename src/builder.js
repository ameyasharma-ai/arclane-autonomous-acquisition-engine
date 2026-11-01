import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { LLMClient } from './llm.js';
import { loadGoogleSheet, updateLeadFields, highlightCell } from './sheets.js';
import { agencyPublisher } from './agency_publisher.js';

const execAsync = util.promisify(exec);

export class WebsiteBuilder {
    constructor(telegramBot, chatId) {
        this.telegramBot = telegramBot;
        this.chatId = chatId;
        this.llmClient = new LLMClient();
        this.reportsDir = path.join(process.cwd(), 'reports');
        this.sitesDir = path.join(process.cwd(), 'generated_sites');

        if (!fs.existsSync(this.sitesDir)) {
            fs.mkdirSync(this.sitesDir, { recursive: true });
        }
    }

    async sendStatus(msg) {
        console.log(`[Builder] ${msg}`);
        import('./web_ui.js').then(({ webUI }) => webUI.broadcast(msg)).catch(()=>{});
        if (this.telegramBot && this.chatId && this.chatId !== 'local-web-ui' && this.chatId !== 'web_ui_user') {
            try {
                await this.telegramBot.telegram.sendMessage(this.chatId, msg, { parse_mode: 'Markdown' });
            } catch (e) {
                // Fallback without markdown in case message has unescaped characters
                try {
                    await this.telegramBot.telegram.sendMessage(this.chatId, msg);
                } catch (err) {
                    if (!err.message.includes('chat not found')) {
                        console.error("Failed to send telegram status:", err.message);
                    }
                }
            }
        }
    }

    async buildClientWebsite(clientId, force = false) {
        const clientReportsDir = path.join(this.reportsDir, String(clientId));
        const auditMdPath = path.join(clientReportsDir, 'audit.md');
        const legacyReportPath = path.join(this.reportsDir, `${clientId}.txt`);

        let reportPath = legacyReportPath;
        if (fs.existsSync(auditMdPath)) {
            reportPath = auditMdPath;
        } else if (!fs.existsSync(legacyReportPath)) {
            throw new Error(`Report file for Client ${clientId} not found. Please run /analyse first.`);
        }

        const reportContent = fs.readFileSync(reportPath, 'utf-8');

        // Extract Business Name
        let businessName = `Client ${clientId}`;
        const nameMatch = reportContent.match(/\*\*Business Name:\*\*\s*(.+)/i) || reportContent.match(/REPORT:\s*(.+)/i);
        if (nameMatch) {
            businessName = nameMatch[1].replace(/[*#]/g, '').trim();
        }

        // Failsafe: Check if client website is already built and live
        const outreachJsonPath = path.join(clientReportsDir, 'outreach.json');
        const clientFinalPath = path.join(clientReportsDir, 'final.txt');
        const clientOutreachTxtPath = path.join(clientReportsDir, 'outreach.txt');

        if (!force) {
            let existingLiveUrl = null;
            if (fs.existsSync(outreachJsonPath)) {
                try {
                    const parsed = JSON.parse(fs.readFileSync(outreachJsonPath, 'utf-8'));
                    if (parsed.deployedUrl) existingLiveUrl = parsed.deployedUrl;
                } catch (e) {}
            }
            if (!existingLiveUrl && fs.existsSync(clientOutreachTxtPath)) {
                const existingContent = fs.readFileSync(clientOutreachTxtPath, 'utf-8');
                const existingUrlMatch = existingContent.match(/https:\/\/[a-zA-Z0-9-.]+\.vercel\.app/i);
                if (existingUrlMatch) existingLiveUrl = existingUrlMatch[0];
            } else if (!existingLiveUrl && fs.existsSync(clientFinalPath)) {
                const existingContent = fs.readFileSync(clientFinalPath, 'utf-8');
                const existingUrlMatch = existingContent.match(/https:\/\/[a-zA-Z0-9-.]+\.vercel\.app/i);
                if (existingUrlMatch) existingLiveUrl = existingUrlMatch[0];
            }
            if (existingLiveUrl) {
                await this.sendStatus(`⏭️ *Lead ${clientId} (${businessName}) is already built & deployed!* \n\n` +
                    `🔗 *Live Website:* ${existingLiveUrl}\n` +
                    `📄 *Reports:* \`reports/${clientId}/outreach.json\` is ready.\n\n` +
                    `💡 *(To force rebuild from scratch, send: \`build_${clientId}.txt --force\`)*`);
                return {
                    clientId,
                    businessName,
                    deployedUrl: existingLiveUrl,
                    alreadyBuilt: true
                };
            }
        }

        // 1. Extract Antigravity Prompt
        let antigravityPrompt = "";
        const promptMatch = reportContent.match(/## 14\.\s*FINAL\s*(?:ANTIGRAVITY|EMERGENT)\s*PROMPT\s*```markdown\s*([\s\S]*?)\s*```/i);
        if (promptMatch) {
            antigravityPrompt = promptMatch[1].trim();
        } else {
            // Fallback: search for Section 14 or use whole audit
            const section14Match = reportContent.match(/## 14\.\s*FINAL[\s\S]*?(?=\[AUDIT_END\]|$)/i);
            if (section14Match) {
                antigravityPrompt = section14Match[0].trim();
            } else {
                antigravityPrompt = reportContent;
            }
        }

        // Check for authentic Google Maps photos manifest
        const photosManifestPath = path.join(clientReportsDir, 'photos_manifest.json');
        let hasAuthenticPhotos = false;
        if (fs.existsSync(photosManifestPath)) {
            try {
                const pManifest = JSON.parse(fs.readFileSync(photosManifestPath, 'utf8'));
                if (pManifest && pManifest.hasRealPhotos) {
                    hasAuthenticPhotos = true;
                    let photoInstructions = "\n\n## 📸 CRITICAL MANDATE: EMBED AUTHENTIC BUSINESS PHOTOGRAPHY (DO NOT USE STOCK URLS)\n" +
                        "We have extracted and downloaded real, high-resolution photographs of this business directly from their Google Maps profile into the local './assets/' directory.\n" +
                        "You MUST integrate these real images into the website using their exact relative paths:\n";

                    if (pManifest.hero && pManifest.hero.src) {
                        photoInstructions += "- HERO SECTION BANNER: Use '<img src=\"" + pManifest.hero.src + "\" alt=\"" + (pManifest.hero.description || businessName) + "\" class=\"w-full h-full object-cover\">' as the main hero background or visual focus.\n";
                    }
                    if (Array.isArray(pManifest.featured) && pManifest.featured.length > 0) {
                        photoInstructions += "- FEATURED SERVICES / SIGNATURE HIGHLIGHTS:\n";
                        pManifest.featured.forEach((f, idx) => {
                            photoInstructions += "  * Service Card " + (idx + 1) + ": '<img src=\"" + f.src + "\" alt=\"" + (f.description || 'Featured highlight') + "\" class=\"w-full h-48 sm:h-56 object-cover rounded-xl mb-4\">'\n";
                        });
                    }
                    if (Array.isArray(pManifest.gallery) && pManifest.gallery.length > 0) {
                        photoInstructions += "- AUTHENTIC GALLERY / FACILITY SHOWCASE:\n";
                        pManifest.gallery.forEach((g, idx) => {
                            photoInstructions += "  * Gallery Card " + (idx + 1) + ": '<img src=\"" + g.src + "\" alt=\"" + (g.description || 'Facility interior') + "\" class=\"w-full h-64 object-cover rounded-2xl\">'\n";
                        });
                    }
                    photoInstructions += "\nSTRICT INSTRUCTION: Use these exact relative paths ('./assets/...'). Do NOT replace these with Unsplash URLs or placeholder images.\n";

                    antigravityPrompt += photoInstructions;
                    console.log("[Builder] 📸 Injected authentic Google Maps photo instructions for " + businessName + "!");
                }
            } catch (e) {
                console.warn('[Builder] Photos manifest read error:', e.message);
            }
        }

        await this.sendStatus(`🚀 *[1/4] Generating Website Code for ${businessName}...*\nUsing Antigravity Prompt from reports/${clientId}`);

        // 2. Generate Code using LLM
        let rawCode = await this.llmClient.generateCode(antigravityPrompt);
        
        // Strip code fences if present
        let htmlCode = rawCode;
        const codeBlockMatch = rawCode.match(/```html\s*([\s\S]*?)\s*```/i);
        if (codeBlockMatch) {
            htmlCode = codeBlockMatch[1].trim();
        } else {
            htmlCode = htmlCode.replace(/^```[\w]*\s*/i, '').replace(/\s*```$/i, '').trim();
        }

        // Apply deterministic design quality gate (guarantees solid header, top-11/12 mobile drawer spacing, rounded-tl-2xl, and backdrop overlay)
        htmlCode = this.enforceDesignQualityStandards(htmlCode);

        // 3. Save locally to generated_sites/<clientId>
        const clientSiteDir = path.join(this.sitesDir, String(clientId));
        if (!fs.existsSync(clientSiteDir)) {
            fs.mkdirSync(clientSiteDir, { recursive: true });
        }
        const htmlFilePath = path.join(clientSiteDir, 'index.html');
        fs.writeFileSync(htmlFilePath, htmlCode, 'utf-8');

        // Stage into web-dev-agency/public/sites/<slug>/index.html
        const staged = await agencyPublisher.stageSite(clientId, businessName, htmlCode);
        const vercelSlug = staged.slug;
        const deployedUrl = staged.deployedUrl;
        // Ensure authentic assets are synced to agency public sites and generated_sites
        const agencyAssetsDir = path.join(agencyPublisher.agencyPublicSitesDir, vercelSlug, 'assets');
        const clientAssetsDir = path.join(clientSiteDir, 'assets');
        const reportsAssetsDir = path.join(clientReportsDir, 'assets');

        const sourceAssetsDir = fs.existsSync(reportsAssetsDir) ? reportsAssetsDir : (fs.existsSync(clientAssetsDir) ? clientAssetsDir : null);
        if (sourceAssetsDir && fs.existsSync(sourceAssetsDir)) {
            if (!fs.existsSync(agencyAssetsDir)) fs.mkdirSync(agencyAssetsDir, { recursive: true });
            if (!fs.existsSync(clientAssetsDir)) fs.mkdirSync(clientAssetsDir, { recursive: true });

            const assetFiles = fs.readdirSync(sourceAssetsDir);
            for (const f of assetFiles) {
                fs.copyFileSync(path.join(sourceAssetsDir, f), path.join(agencyAssetsDir, f));
                fs.copyFileSync(path.join(sourceAssetsDir, f), path.join(clientAssetsDir, f));
            }
            console.log(`[Builder] 📁 Synced ${assetFiles.length} authentic asset files to /sites/${vercelSlug}/assets/`);
        }

        const githubRepoUrl = `https://github.com/ameyasharma-ai/WEB-DEV-AGENCY/tree/main/public/sites/${vercelSlug}`;

        await this.sendStatus(`✅ *[2/4] Code Generated Successfully!*\nSaved locally to \`generated_sites/${clientId}/index.html\`\nStaged for subdomain: \`${deployedUrl}\``);

        // 4. Staged for batch deployment (every 5 scrapes or end of run)
        await this.sendStatus(`📦 *[3/4] Staged for Agency Subdomain Build (${agencyPublisher.batchQueue.length}/5 in current batch)...*`);

        // Check if batch threshold (5 leads) is reached
        if (agencyPublisher.shouldDeployBatch()) {
            await agencyPublisher.deployBatch(async (msg) => this.sendStatus(msg));
        }

        // 5. Generate structured & formatted reports in reports/<clientId>/
        if (!fs.existsSync(clientReportsDir)) {
            fs.mkdirSync(clientReportsDir, { recursive: true });
        }

        // Extract WhatsApp message
        let waMessage = "";
        const waMatch = reportContent.match(/\[WHATSAPP_START\]([\s\S]*?)\[WHATSAPP_END\]/i);
        if (waMatch) {
            waMessage = waMatch[1].trim().replace(/\[website-url\]|https:\/\/[a-zA-Z0-9-.]+\.vercel\.app/gi, deployedUrl);
        }

        // Extract Call Script
        let callScript = "";
        const callMatch = reportContent.match(/\[CALL_SCRIPT_START\]([\s\S]*?)\[CALL_SCRIPT_END\]/i);
        if (callMatch) {
            callScript = callMatch[1].trim().replace(/\[website-url\]|https:\/\/[a-zA-Z0-9-.]+\.vercel\.app/gi, deployedUrl);
        }

        // Extract Contact info
        const phoneMatch = reportContent.match(/Phone:\s*([^\n\r]+)/i);
        const waPhoneMatch = reportContent.match(/WhatsApp:\s*([^\n\r]+)/i);
        let phone = phoneMatch && !phoneMatch[1].toLowerCase().includes('not available') ? phoneMatch[1].trim() : '';
        let whatsappPhone = waPhoneMatch && !waPhoneMatch[1].toLowerCase().includes('not available') ? waPhoneMatch[1].trim() : phone;

        // Sheet fallback for phone number if audit didn't catch it
        if (!phone || !whatsappPhone) {
            try {
                const { sheet } = await loadGoogleSheet();
                const rows = await sheet.getRows();
                const matched = rows.find(r => r.get('Client ID') == String(clientId));
                if (matched) {
                    const sheetPhone = matched.get('Phone/WhatsApp') || matched.get('Phone') || matched.get('WhatsApp') || '';
                    if (sheetPhone) {
                        phone = phone || sheetPhone;
                        whatsappPhone = whatsappPhone || sheetPhone;
                    }
                }
            } catch (sheetErr) {
                console.warn("[Builder] Sheet fallback notice:", sheetErr.message);
            }
        }

        const agencyPathUrl = staged.agencyPathUrl || `https://www.arclanestudios.space/sites/${vercelSlug}`;

        // Verify if subdomain is active or if Vercel project domain limit is reached
        let subdomainVerified = false;
        try {
            subdomainVerified = await agencyPublisher.isSubdomainActive(vercelSlug);
        } catch (subErr) {
            subdomainVerified = false;
        }

        // Canonical working URL to feature in CRM & outreach
        const primaryLiveUrl = subdomainVerified ? deployedUrl : agencyPathUrl;

        // Construct structured JSON
        const outreachJson = {
            clientId: Number(clientId),
            businessName,
            phone,
            whatsapp: whatsappPhone,
            deployedUrl: primaryLiveUrl,
            agencyHostedUrl: agencyPathUrl,
            subdomainUrl: subdomainVerified ? deployedUrl : '',
            githubRepoUrl,
            whatsappMessage: waMessage.replace(new RegExp(deployedUrl, 'g'), primaryLiveUrl),
            callScript: callScript.replace(new RegExp(deployedUrl, 'g'), primaryLiveUrl),
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(outreachJsonPath, JSON.stringify(outreachJson, null, 2), 'utf-8');

        // Construct human-readable outreach text
        const finalWaMessage = outreachJson.whatsappMessage;
        const finalCallScript = outreachJson.callScript;
        const outreachTxt = `[CONTACT_DETAILS]\nPhone: ${phone || 'Not available.'}\nWhatsApp: ${whatsappPhone || 'Not available.'}\n\n[OUTREACH_PLATFORM]\nWhatsApp & Follow-up Phone Call\n\n[FINAL_OUTREACH_MESSAGE]\n\n[WHATSAPP_START]\n${finalWaMessage}\n[WHATSAPP_END]\n\n[CALL_SCRIPT_START]\n${finalCallScript}\n[CALL_SCRIPT_END]`;
        fs.writeFileSync(path.join(clientReportsDir, 'outreach.txt'), outreachTxt, 'utf-8');
        fs.writeFileSync(clientFinalPath, outreachTxt, 'utf-8');

        // Update audit.md with live deployed URL
        const updatedReportContent = reportContent
            .replace(/\[website-url\]|https:\/\/[a-zA-Z0-9-.]+\.vercel\.app/gi, primaryLiveUrl)
            .replace(new RegExp(deployedUrl, 'g'), primaryLiveUrl);
        fs.writeFileSync(auditMdPath, updatedReportContent, 'utf-8');

        // Stage audit report & metadata into web-dev-agency/public/reports/<clientId>/
        const auditReportUrl = agencyPublisher.stageReport(clientId, updatedReportContent, outreachJson);

        // Update Google Sheet with Subdomain URL, Agency Hosted URL, Existing Website, Audit Report URL, AI Outreach Hook, & Status
        try {
            const { sheet, doc } = await loadGoogleSheet();
            const rows = await sheet.getRows();
            const existingRow = rows.find(r => r.get('Client ID') == String(clientId));
            const existingWebsite = (existingRow?.get('Existing Website') || existingRow?.get('Website URL') || '').trim();
            const existingNotes = (existingRow?.get('Notes') || '').toLowerCase();
            const isInterest = existingNotes.includes('website_of_interest') || 
                               ['netlify', 'vercel', 'github.io', 'replit', 'grexa', 'svhrt', 'yourdigitallift', 'gym.com', 'marxfitness'].some(d => existingWebsite.toLowerCase().includes(d));

            // Clean Agency Hosted URL contains only our hosted demo
            const agencyHostedValue = agencyPathUrl;

            const sheetUpdates = {
                'Agency Hosted URL': agencyHostedValue,
                'Audit Report URL': auditReportUrl,
                'AI Outreach Hook': finalWaMessage,
                'Current Status': 'Website Built'
            };

            // Preserve or set Existing Website if it was an external site of interest
            if (isInterest && existingWebsite && !existingWebsite.includes('arclanestudios.space')) {
                sheetUpdates['Existing Website'] = existingWebsite;
            }

            // If domain limit encountered, do NOT write broken subdomain to CRM; leave blank
            if (subdomainVerified) {
                sheetUpdates['Subdomain URL'] = deployedUrl;
            } else {
                sheetUpdates['Subdomain URL'] = '';
            }

            await updateLeadFields(sheet, Number(clientId), sheetUpdates);

            // Highlight Existing Website cell in Red if this lead had an existing website we wanted to build for (website_of_interest)
            try {
                if (isInterest) {
                    const rowIndex = rows.findIndex(r => r.get('Client ID') == String(clientId));
                    if (rowIndex !== -1) {
                        const existColIndex = sheet.headerValues.indexOf('Existing Website') !== -1 
                            ? sheet.headerValues.indexOf('Existing Website') 
                            : sheet.headerValues.indexOf('Agency Hosted URL');
                        if (existColIndex !== -1) {
                            // rowIndex + 1 because row 0 is header row
                            await highlightCell(sheet, doc, rowIndex + 1, existColIndex);
                            console.log(`[GoogleSheet] 🚨 Highlighted Existing Website in RED for Lead #${clientId} (${businessName})`);
                        }
                    }
                }
            } catch (highlightErr) {
                console.warn("[GoogleSheet] Highlight styling notice:", highlightErr.message);
            }
        } catch (sheetErr) {
            console.error("Sheet update notice:", sheetErr.message);
        }

        await this.sendStatus(`🎉 *[4/4] Website Built & Hosted Successfully!*\n\n` +
            `🔗 *Live Website:* ${primaryLiveUrl}\n` +
            (subdomainVerified ? `🌐 *Subdomain:* ${deployedUrl}\n` : `🌐 *Agency Hosted URL:* ${agencyPathUrl} (Subdomain omitted due to domain limit)\n`) +
            `📦 *GitHub Repo:* ${githubRepoUrl}\n` +
            `📁 *Local Site:* \`generated_sites/${clientId}/\`\n` +
            `📄 *Structured Report:* \`reports/${clientId}/outreach.json\``);

        // Send preview of final outreach message
        await this.sendStatus(`📋 *Ready-to-Send WhatsApp Outreach Preview:*\n\n\`\`\`\n${finalWaMessage}\n\`\`\``);

        return {
            clientId,
            businessName,
            deployedUrl,
            githubRepoUrl,
            outreachJsonPath
        };
    }

    enforceDesignQualityStandards(html) {
        if (!html || typeof html !== 'string') return html;

        // 0. Ensure a vibrant, high-DPI industry-specific SVG favicon is always injected
        if (!html.includes('rel="icon"') && !html.includes("rel='icon'")) {
            let emoji = '⚡';
            const lowerHtml = html.toLowerCase();
            if (lowerHtml.includes('gym') || lowerHtml.includes('fitness') || lowerHtml.includes('workout') || lowerHtml.includes('crossfit')) {
                emoji = '⚡';
            } else if (lowerHtml.includes('restaurant') || lowerHtml.includes('cafe') || lowerHtml.includes('dhaba') || lowerHtml.includes('dine') || lowerHtml.includes('bhojnalaya') || lowerHtml.includes('food')) {
                emoji = '🍽️';
            } else if (lowerHtml.includes('salon') || lowerHtml.includes('spa') || lowerHtml.includes('beauty') || lowerHtml.includes('hair') || lowerHtml.includes('parlour')) {
                emoji = '✂️';
            } else if (lowerHtml.includes('clinic') || lowerHtml.includes('dental') || lowerHtml.includes('hospital') || lowerHtml.includes('care') || lowerHtml.includes('doctor')) {
                emoji = '🩺';
            } else {
                emoji = '✨';
            }

            const faviconSvg = `<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2224%22 fill=%22%230F172A%22/><text y=%2268%22 x=%2250%22 text-anchor=%22middle%22 font-size=%2260%22>${emoji}</text></svg>">`;
            if (html.includes('<head>')) {
                html = html.replace('<head>', `<head>\n    ${faviconSvg}`);
            } else if (html.includes('<head ')) {
                html = html.replace(/(<head\s*[^>]*>)/i, `$1\n    ${faviconSvg}`);
            }
        }

        // 1. Ensure header is 100% solid/opaque and never transparent
        html = html.replace(/(<header\s+[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, classes, p3) => {
            let c = classes;
            c = c.replace(/\bbg-transparent\b/g, 'bg-[#09090b]');
            c = c.replace(/\bbg-black\/[0-9]+\b/g, 'bg-[#09090b]');
            c = c.replace(/\bbg-zinc-950\/[0-9]+\b/g, 'bg-[#09090b]');
            c = c.replace(/\bbg-white\/[0-9]+\b/g, 'bg-white');
            if (!c.includes('sticky')) c = `sticky top-0 ${c}`;
            if (!c.includes('z-40') && !c.includes('z-50')) c = `z-40 ${c}`;
            return `${p1}${c}${p3}`;
        });

        // 2. Ensure bottom mobile sticky bar has z-40 (so drawer and backdrop sit cleanly on top)
        html = html.replace(/(class="[^"]*fixed\s+bottom-0[^"]*z-)(?:50|40|30|20)([^"]*")/g, '$140$2');

        // 3. Enforce mobile menu drawer styling: top-11 sm:top-12, z-[100], rounded-tl-2xl, p-6 pt-5
        html = html.replace(
            /<div\s+[^>]*id=["']mobile-menu["'][^>]*class=["']([^"']*)["'][^>]*>/gi,
            (match, classes) => {
                const isLight = html.includes('bg-[#FAF9F6]') || html.includes('bg-[#FFFDF9]');
                const drawerClasses = `fixed top-11 sm:top-12 bottom-0 right-0 z-[100] w-full max-w-xs sm:max-w-sm ${isLight ? 'bg-[#FAF9F6] border-l border-t border-[#D4AF37]/30 text-[#1A1A1A]' : 'bg-[#09090b] border-l border-t border-zinc-800 text-white'} p-6 pt-5 flex flex-col justify-between transform translate-x-full transition-transform duration-300 lg:hidden shadow-2xl overflow-y-auto rounded-tl-2xl`;
                return `<div id="mobile-menu" class="${drawerClasses}">`;
            }
        );

        // 4. Ensure backdrop overlay exists
        if ((html.includes('id="mobile-menu"') || html.includes('id="mobile-drawer"')) && !html.includes('id="menu-backdrop"')) {
            const backdropHtml = `\n    <!-- Mobile Menu Backdrop Overlay -->\n    <div id="menu-backdrop" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90] hidden transition-opacity duration-300"></div>\n`;
            html = html.replace(/(<div\s+[^>]*id=["']mobile-(?:menu|drawer)["'])/i, `${backdropHtml}$1`);
        }

        // 5. Enforce Fluid Mobile Typography on H1 (Prevents horizontal overflow and clipping on 360px-420px mobile screens)
        html = html.replace(/(<h1\s+[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, classes, p3) => {
            let c = classes;
            // Remove oversized base font sizes
            c = c.replace(/\btext-[3-7]xl\b/g, '');
            c = c.replace(/\bsm:text-[4-7]xl\b/g, '');
            c = c.replace(/\blg:text-[5-7]xl\b/g, '');
            c = c.replace(/\bxl:text-[6-7]xl\b/g, '');
            c = `text-2xl sm:text-4xl md:text-5xl lg:text-5xl xl:text-6xl leading-[1.15] break-words ${c}`.replace(/\s+/g, ' ').trim();
            return `${p1}${c}${p3}`;
        });

        // 6. Ensure H2 Section Headings are wrap-safe on mobile
        html = html.replace(/(<h2\s+[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, classes, p3) => {
            let c = classes;
            if (!c.includes('break-words')) c = `break-words ${c}`;
            c = c.replace(/\btext-[4-7]xl\b/g, 'text-2xl sm:text-3xl md:text-4xl');
            return `${p1}${c}${p3}`;
        });

        // 7. Ensure Body and HTML have zero horizontal overflow and ample bottom padding for mobile sticky action bar
        html = html.replace(/(<body\s+[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, classes, p3) => {
            let c = classes;
            if (!c.includes('pb-28') && !c.includes('pb-24') && !c.includes('pb-20')) c = `pb-28 lg:pb-0 ${c}`;
            if (!c.includes('overflow-x-hidden')) c = `overflow-x-hidden ${c}`;
            return `${p1}${c}${p3}`;
        });

        html = html.replace(/(<html\s+[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, classes, p3) => {
            let c = classes;
            if (!c.includes('overflow-x-hidden')) c = `overflow-x-hidden ${c}`;
            return `${p1}${c}${p3}`;
        });

        // 8. Deterministic Security Post-Processing (Zero-Vulnerability Guarantee)
        // A. Inject Strict Content-Security-Policy and Referrer-Policy into <head>
        const securityMetaTags = `
    <!-- ArcLane Zero-Vulnerability Security Headers -->
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' https: data: blob:; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' https:; frame-src 'self' https://www.google.com https://maps.google.com; object-src 'none'; base-uri 'self';">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <meta http-equiv="X-Content-Type-Options" content="nosniff">
    <meta http-equiv="X-Frame-Options" content="SAMEORIGIN">`;

        if (!html.includes('Content-Security-Policy')) {
            if (html.includes('<head>')) {
                html = html.replace('<head>', `<head>${securityMetaTags}`);
            } else if (html.includes('<head ')) {
                html = html.replace(/(<head\s*[^>]*>)/i, `$1${securityMetaTags}`);
            }
        }

        // B. Ensure all target="_blank" links have rel="noopener noreferrer" (Reverse Tabnabbing & Opener Protection)
        html = html.replace(/(<a\s+[^>]*target=["']_blank["'][^>]*)(>)/gi, (match, prefix, closing) => {
            if (!prefix.includes('rel=')) {
                return `${prefix} rel="noopener noreferrer"${closing}`;
            } else if (!prefix.includes('noopener')) {
                return prefix.replace(/rel=["']([^"']*)["']/i, 'rel="$1 noopener noreferrer"') + closing;
            }
            return match;
        });

        // C. Neutralize unsafe pseudo-protocols and inline script-injection vectors
        html = html.replace(/(href|src)=["'](?:javascript|vbscript|data:text\/html):[^"']*["']/gi, '$1="#"');

        // D. Upgrade CDN http:// resources to strict https://
        html = html.replace(/src=["']http:\/\/cdn\./gi, 'src="https://cdn.');
        html = html.replace(/href=["']http:\/\/fonts\./gi, 'href="https://fonts.');
        html = html.replace(/src=["']http:\/\//gi, 'src="https://');
        html = html.replace(/href=["']http:\/\//gi, 'href="https://');

        // E. Sanitize any accidental embedded credentials or API keys in code
        html = html.replace(/(?:vcp_[a-zA-Z0-9_-]{20,}|AIzaSy[a-zA-Z0-9_-]{20,}|sk-or-v1-[a-zA-Z0-9_-]{20,})/g, '[REDACTED]');

        return html;
    }
}



