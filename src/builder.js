import { resolveVerifiedFoodImage, VERIFIED_IMAGE_CATALOG, getVerifiedNicheAssets } from './engine/verified_asset_catalog.js';
import { photoPolicy } from './engine/photo_policy.js';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { LLMClient } from './llm.js';
import { loadGoogleSheet, updateLeadFields, highlightCell } from './sheets.js';
import { agencyPublisher } from './agency_publisher.js';
import { mapsPhotoCrawler } from './engine/maps_photo_crawler.js';
import { mapsPhotoPipeline } from './engine/maps_photo_pipeline.js';
import { visualQualityGate } from './engine/visual_quality_gate.js';
import { injectAgencyCredit } from './engine/agency_branding.js';

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

        // Check for authentic Google Maps photos manifest (or autonomous crawl)
        const photosManifestPath = path.join(clientReportsDir, 'photos_manifest.json');
        let hasAuthenticPhotos = false;

        // Check persistent Photo Policy mode & per-lead overrides
        const leadPhotoPref = photoPolicy.getLeadPhotoSource(clientId);
        const globalPhotoPolicy = photoPolicy.getMode();
        const forceStock = leadPhotoPref === 'stock' || globalPhotoPolicy === 'stock_only';

        let industry = 'Commercial';
        const indMatch = reportContent.match(/(?:Industry|Niche|Vertical):\s*([^\n\r]+)/i);
        if (indMatch) industry = indMatch[1].trim();

        // Autonomous Google Maps Photo Extraction & Vision Classification (or Verified Stock Policy)
        if (forceStock) {
            console.log(`[Builder] 🖼️ Photo Policy active: Using verified curated stock library for Lead #${clientId} (${businessName})...`);
            const stockAssets = getVerifiedNicheAssets(industry + ' ' + businessName);
            const stockManifest = {
                hasRealPhotos: false,
                useStockForHero: true,
                photoSource: 'verified_stock',
                hero: { src: stockAssets.hero, description: `${businessName} verified ambiance` },
                featured: (stockAssets.featured || []).map((src, i) => ({ src, description: `Signature highlight ${i + 1}` })),
                gallery: (stockAssets.gallery || []).map((src, i) => ({ src, description: `Facility ambiance ${i + 1}` }))
            };
            fs.writeFileSync(photosManifestPath, JSON.stringify(stockManifest, null, 2), 'utf8');
        } else if (!fs.existsSync(photosManifestPath)) {
            try {
                let mapsUrl = '';
                const mapsMatch = reportContent.match(/(?:Google Maps URL|Maps URL|Listing URL):\s*([^\n\r]+)/i);
                if (mapsMatch) mapsUrl = mapsMatch[1].trim();

                let address = '';
                const addrMatch = reportContent.match(/(?:Address|Full Address):\s*([^\n\r]+)/i);
                if (addrMatch) address = addrMatch[1].trim();

                console.log(`[Builder] 📸 Autonomous Google Maps Photo Pipeline running for "${businessName}"...`);
                await this.sendStatus(`📸 *Extracting real Google Maps photos for ${businessName}...*`);

                const candidateUrls = await mapsPhotoCrawler.fetchPhotosForBusiness(businessName, mapsUrl, address);
                await mapsPhotoCrawler.close();

                if (candidateUrls.length > 0) {
                    await this.sendStatus(`🧠 *Classifying ${candidateUrls.length} real photos with Gemini Vision for ${businessName}...*`);
                    const classified = await mapsPhotoPipeline.classifyPhotos(candidateUrls, businessName, industry);

                    const slug = await agencyPublisher.getSlug(businessName);
                    const agencySiteDir = path.join(agencyPublisher.agencyPublicSitesDir, slug);
                    const clientSiteDir = path.join(this.sitesDir, String(clientId));

                    await mapsPhotoPipeline.downloadAndStageAssets(classified, clientReportsDir);
                    await mapsPhotoPipeline.downloadAndStageAssets(classified, agencySiteDir);
                    await mapsPhotoPipeline.downloadAndStageAssets(classified, clientSiteDir);
                    console.log(`[Builder] ✅ Real photos extracted & staged for ${businessName}`);
                } else {
                    console.log(`[Builder] ℹ️ Zero Maps photos found for ${businessName}, seamlessly falling back to verified curated stock.`);
                    const stockAssets = getVerifiedNicheAssets(industry + ' ' + businessName);
                    const stockManifest = {
                        hasRealPhotos: false,
                        useStockForHero: true,
                        photoSource: 'verified_stock',
                        hero: { src: stockAssets.hero, description: `${businessName} verified ambiance` },
                        featured: (stockAssets.featured || []).map((src, i) => ({ src, description: `Signature highlight ${i + 1}` })),
                        gallery: (stockAssets.gallery || []).map((src, i) => ({ src, description: `Facility ambiance ${i + 1}` }))
                    };
                    fs.writeFileSync(photosManifestPath, JSON.stringify(stockManifest, null, 2), 'utf8');
                }
            } catch (crawlErr) {
                console.warn(`[Builder] Auto-crawl photo notice: ${crawlErr.message}`);
            }
        }
        if (fs.existsSync(photosManifestPath)) {
            try {
                const pManifest = JSON.parse(fs.readFileSync(photosManifestPath, 'utf8'));
                if (pManifest && pManifest.hasRealPhotos) {
                    hasAuthenticPhotos = true;
                    let photoInstructions = "\n\n## 📸 CRITICAL MANDATE: EMBED AUTHENTIC BUSINESS PHOTOGRAPHY (DO NOT USE STOCK URLS)\n" +
                        "We have extracted and downloaded real, high-resolution photographs of this business directly from their Google Maps profile into the local './assets/' directory.\n" +
                        "You MUST integrate these real images into the website using their exact relative paths:\n";

                    if (pManifest.hero && pManifest.hero.src && !pManifest.useStockForHero) {
                        photoInstructions += "- HERO SECTION BANNER: Use '<img src=\"" + pManifest.hero.src + "\" alt=\"" + (pManifest.hero.description || businessName) + "\" class=\"w-full h-full object-cover\">' as the main hero background or visual focus.\n";
                    } else {
                        photoInstructions += "- HERO SECTION BACKDROP: Use a clean, atmospheric ambient gradient or verified 4K architectural interior stock photo for the wide hero backdrop. DO NOT use street hoardings, flex banners, or outdoor vinyl signs with neighboring shop text!\n";
                    }
                    if (Array.isArray(pManifest.featured) && pManifest.featured.length > 0) {
                        photoInstructions += "- DESKTOP HERO SHOWCASE CARD (RIGHT COLUMN) & SIGNATURE HIGHLIGHTS:\n" +
                            "  * The desktop split-hero right column Showcase Card MUST embed authentic image '<img src=\"" + pManifest.featured[0].src + "\" alt=\"" + (pManifest.featured[0].description || businessName) + "\" class=\"w-full h-72 sm:h-84 lg:h-[400px] object-cover rounded-2xl\">' in 100% full opacity (NEVER dimmed, washed out, or tinted with black overlays!).\n";
                        pManifest.featured.forEach((f, idx) => {
                            photoInstructions += "  * Featured Highlight Card " + (idx + 1) + ": '<img src=\"" + f.src + "\" alt=\"" + (f.description || 'Featured highlight') + "\" class=\"w-full h-48 sm:h-56 object-cover rounded-xl mb-4\">'\n";
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

        // Injected Mandatory Header, Monogram & Navbar Anti-Collision Standards
        const cleanNameForMonogram = businessName.replace(/^(?:The|A|An)\s+/i, '').replace(/[^a-zA-Z0-9\s]/g, '').trim();
        const wordsForMonogram = cleanNameForMonogram.split(/\s+/).filter(w => w.length > 0);
        let canonicalMonogram = wordsForMonogram.length >= 2 ? (wordsForMonogram[0][0] + wordsForMonogram[1][0]).toUpperCase() : cleanNameForMonogram.slice(0, 2).toUpperCase();

        const navbarPromptRules = `\n\n## 🧭 MANDATORY HEADER & NAVBAR DESIGN STANDARDS:
- BRAND LOGO MONOGRAM: The logo badge square MUST display the 2-letter monogram '${canonicalMonogram}' (e.g. '<div class="w-10 h-10 rounded-xl ... font-syne font-black text-lg">${canonicalMonogram}</div>'). NEVER use an isolated single letter like 'P'!
- BRAND CONTAINER & FLUID RESPONSIVE TYPOGRAPHY: The brand logo wrapper MUST have 'flex items-center gap-2.5 sm:gap-3 shrink-0 min-w-0 mr-4 lg:mr-8 group'. The brand title text MUST have 'truncate max-w-[160px] xs:max-w-[200px] sm:max-w-none block font-extrabold leading-tight' and subtitle MUST have 'truncate max-w-[160px] xs:max-w-[200px] sm:max-w-none block' so the logo NEVER overflows or collides with mobile header buttons on 360px-440px viewports!
- HIGH-INTENT NAVIGATION LINKS: The desktop navbar MUST include a link to '#pricing' (labeled 'Plans' or 'Pricing'). Keep nav links concise: at most 4-5 core links ('Programs' / 'Services', 'About', 'Plans' / 'Pricing', 'Gallery' / 'Facility', 'Contact'). Secondary links ('Why Us', 'Reviews', 'FAQ') must have 'hidden 2xl:inline-block'.
- BALANCED CENTERED NAVBAR: The <nav> element MUST have 'hidden lg:flex items-center justify-center gap-3 lg:gap-4 xl:gap-6 2xl:gap-6 mx-auto px-2 lg:px-4 shrink-0'. NEVER stick <nav> directly against the brand logo or use 'mr-4/mr-6' with 'ml-auto'!
- ACTION CTAS: The CTA buttons container MUST have 'hidden sm:flex items-center gap-2 sm:gap-3 shrink-0 flex-nowrap' (do NOT use 'ml-auto' which forces nav to stick to the brand logo). Always include Phone number CTA and WhatsApp Trial CTA with official WhatsApp green ('bg-emerald-600 hover:bg-emerald-500 text-white').

## 🏷️ CARD BADGES & FORM SELECT DESIGN STANDARDS:
- CARD BADGES: When displaying badges on cards (e.g. 'RTX 40-Series', 'PS5 4K HDR'), each card gets at most ONE badge inside its own photo container ('<div class="relative ..."><img ...><span class="absolute top-3 right-3 ...">Badge</span></div>'). NEVER stack multiple badges into one card or leave sibling cards empty!
- FORM SELECT DROPDOWNS: All <select> elements MUST have 'w-full max-w-full appearance-none bg-no-repeat bg-[right_1rem_center] pr-10 rounded-xl truncate text-ellipsis'. Keep <option> text concise (under 24 characters, e.g. 'Pro PC Gaming', 'PS5 4K Console', 'VR Simulator', 'Party Booking') so options never overflow narrow mobile viewports.
`;
        antigravityPrompt += navbarPromptRules;

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

        // Determine canonical slug
        const vercelSlug = await agencyPublisher.getSlug(businessName);

        // Apply deterministic design quality gate (guarantees solid header, top-11/12 mobile drawer spacing, rounded-tl-2xl, backdrop overlay, & triple-tier image fallbacks)
        htmlCode = this.enforceDesignQualityStandards(htmlCode, vercelSlug, businessName);

        // Run automated in-browser Visual Quality Gate (Playwright headless verification)
        console.log(`[Builder] 🛡️ Running Automated Pre-Flight Visual Quality Gate for "${businessName}"...`);
        try {
            const visualAudit = await visualQualityGate.auditAndFix(htmlCode, vercelSlug, businessName);
            if (visualAudit.issuesFixed && visualAudit.issuesFixed.length > 0) {
                console.log(`[Builder] ✅ Visual Quality Gate auto-corrected ${visualAudit.issuesFixed.length} layout issues:\n  - ${visualAudit.issuesFixed.join('\n  - ')}`);
            }
            htmlCode = visualAudit.cleanHtml;
        } catch (gateErr) {
            console.warn('[Builder] Visual Quality Gate notice:', gateErr.message);
        }

        // 3. Save locally to generated_sites/<clientId>
        const clientSiteDir = path.join(this.sitesDir, String(clientId));
        if (!fs.existsSync(clientSiteDir)) {
            fs.mkdirSync(clientSiteDir, { recursive: true });
        }
        const htmlFilePath = path.join(clientSiteDir, 'index.html');
        fs.writeFileSync(htmlFilePath, htmlCode, 'utf-8');

        // Stage into web-dev-agency/public/sites/<slug>/index.html
        const staged = await agencyPublisher.stageSite(clientId, businessName, htmlCode);
        // vercelSlug is already resolved above
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

        // --- Zero-Redundancy Orphaned Asset Pruner ---
        // Scan index.html for all asset files actually referenced, and delete unreferenced files to save Vercel storage
        const referencedAssets = new Set();
        const assetRefRegex = /(?:src|href)=["'][^"']*?assets\/([^"'?#]+)/gi;
        let refMatch;
        while ((refMatch = assetRefRegex.exec(htmlCode)) !== null) {
            referencedAssets.add(refMatch[1].split('/').pop());
        }

        [agencyAssetsDir, clientAssetsDir].forEach(targetDir => {
            if (fs.existsSync(targetDir)) {
                const existingFiles = fs.readdirSync(targetDir);
                for (const file of existingFiles) {
                    if (file === 'photos_manifest.json') continue;
                    if (!referencedAssets.has(file)) {
                        try {
                            fs.unlinkSync(path.join(targetDir, file));
                            console.log(`[Builder] 🗑️ Pruned redundant/orphaned asset: ${file} from ${targetDir}`);
                        } catch (e) {}
                    }
                }
            }
        });

        const githubRepoUrl = `https://github.com/ameyasharma-ai/WEB-DEV-AGENCY/tree/main/public/sites/${vercelSlug}`;

        await this.sendStatus(`✅ *[2/4] Code Generated Successfully!*\nSaved locally to \`generated_sites/${clientId}/index.html\`\nStaged for subdomain: \`${deployedUrl}\``);

        // 4. Staged for batch deployment (every 5 scrapes or end of run)
        await this.sendStatus(`📦 *[3/4] Staged for Agency Subdomain Build (${agencyPublisher.batchQueue.length}/5 in current batch)...*`);

        // Check if batch threshold (5 leads) is reached
        if (force || agencyPublisher.shouldDeployBatch()) {
            await agencyPublisher.deployBatch(async (msg) => this.sendStatus(msg));
        }

        // 5. Generate structured & formatted reports in reports/<clientId>/
        if (!fs.existsSync(clientReportsDir)) {
            fs.mkdirSync(clientReportsDir, { recursive: true });
        }

        // Extract WhatsApp message with bulletproof URL normalization
        let waMessage = "";
        const waMatch = reportContent.match(/\[WHATSAPP_START\]([\s\S]*?)\[WHATSAPP_END\]/i);
        if (waMatch) {
            let msg = waMatch[1].trim();
            msg = msg.replace(/\[website-url\]/gi, deployedUrl);
            msg = msg.replace(/https?:\/\/[a-zA-Z0-9-.]+\.(?:vercel\.app|netlify\.app|workers\.dev|studio|app|github\.io)[^\s]*/gi, deployedUrl);
            msg = msg.replace(/(🔗\s*)https?:\/\/[^\s]+/gi, `$1${deployedUrl}`);
            waMessage = msg;
        }

        // Extract Call Script with bulletproof URL normalization
        let callScript = "";
        const callMatch = reportContent.match(/\[CALL_SCRIPT_START\]([\s\S]*?)\[CALL_SCRIPT_END\]/i);
        if (callMatch) {
            let script = callMatch[1].trim();
            script = script.replace(/\[website-url\]/gi, deployedUrl);
            script = script.replace(/https?:\/\/[a-zA-Z0-9-.]+\.(?:vercel\.app|netlify\.app|workers\.dev|studio|app|github\.io)[^\s]*/gi, deployedUrl);
            script = script.replace(/(🔗\s*)https?:\/\/[^\s]+/gi, `$1${deployedUrl}`);
            callScript = script;
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
            whatsappMessage: waMessage.replace(new RegExp(deployedUrl, 'g'), primaryLiveUrl).replace(/(🔗\s*)https?:\/\/[^\s]+/gi, `$1${primaryLiveUrl}`),
            callScript: callScript.replace(new RegExp(deployedUrl, 'g'), primaryLiveUrl).replace(/(🔗\s*)https?:\/\/[^\s]+/gi, `$1${primaryLiveUrl}`),
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
            deployedUrl: primaryLiveUrl,
            agencyPathUrl,
            subdomainUrl: subdomainVerified ? deployedUrl : '',
            githubRepoUrl,
            outreachJsonPath
        };
    }

    enforceDesignQualityStandards(html, slug = '', businessName = '') {
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

        // 1B. Enforce Header & Navbar Anti-Collision, Monogram Guard & Whitespace-Nowrap
        html = html.replace(/(<header[\s\S]*?<\/header>)/gi, (headerHtml) => {
            let h = headerHtml;

            // Smart 2-Letter Monogram & Responsive Brand Logo Guard
            if (businessName) {
                const cleanName = businessName.replace(/^(?:The|A|An)\s+/i, '').replace(/[^a-zA-Z0-9\s]/g, '').trim();
                const words = cleanName.split(/\s+/).filter(w => w.length > 0);
                const monogram = words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : cleanName.slice(0, 2).toUpperCase();

                if (monogram && monogram.length >= 2) {
                    // Replace isolated single letter in monogram box
                    h = h.replace(/(<a\b[^>]*>[\s\S]*?<div\b[^>]*class=["'][^"']*(?:rounded-xl|rounded-2xl|rounded-lg|rounded-full|w-10|w-11|w-12)[^"']*["'][^>]*>)\s*([A-Za-z])\s*(<\/div>)/i, (m, openDiv, singleLetter, closeDiv) => {
                        return `${openDiv}${monogram}${closeDiv}`;
                    });
                }
            }

            // Restore any corrupted CTA button classes in header that accidentally received announcement-bar styling
            h = h.replace(/(<a[^>]*href=["'][^"']*(?:wa\.me|whatsapp|#trial)[^"']*["'][^>]*class=["'])[^"']*bg-zinc-950[^"']*(["'])/gi,
                '$1whitespace-nowrap shrink-0 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F59E0B] text-black font-bold text-sm hover:brightness-110 shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2$2');

            // Add whitespace-nowrap and shrink-0 to action buttons
            h = h.replace(/(<(?:a|button)[^>]*class=["'][^"']*(?:rounded-xl|rounded-2xl|rounded-full|border|bg-gradient)[^"']*["'][^>]*>)/gi, (btnTag) => {
                if (btnTag.includes('font-syne') || btnTag.includes('group') || btnTag.includes('menu-btn') || btnTag.includes('menu-toggle')) return btnTag; // skip logo and menu button
                let b = btnTag;
                if (!b.includes('whitespace-nowrap')) b = b.replace(/class=["']/, 'class="whitespace-nowrap shrink-0 ');
                return b;
            });

            // Ensure brand logo wrapper has protective right margin, min-w-0, shrink-0 and non-overflowing typography
            h = h.replace(/(<a\b[^>]*class=["'][^"']*(?:flex items-center|group)[^"']*["'][^>]*>[\s\S]*?<\/a>)/gi, (brandHtml) => {
                let b = brandHtml;
                b = b.replace(/(class=["'][^"']*)(["'])/i, (m, cls, q) => {
                    let c = cls;
                    if (!c.includes('shrink-0')) c += ' shrink-0';
                    if (!c.includes('min-w-0')) c += ' min-w-0';
                    if (!c.includes('mr-')) c += ' mr-3 lg:mr-8';
                    return `${c}${q}`;
                });
                // Ensure text container has min-w-0
                b = b.replace(/(<div\b[^>]*class=["'][^"']*(?:flex flex-col|flex-col)[^"']*["'])/i, (divTag) => {
                    if (!divTag.includes('min-w-0')) return divTag.replace(/class=["']/, 'class="min-w-0 ');
                    return divTag;
                });
                // Add truncate and max-w to title and subtitle spans
                b = b.replace(/(<span\b[^>]*class=["'][^"']*(?:font-syne|font-serif|font-bold|font-extrabold|tracking-tight|tracking-wider)[^"']*["'])/gi, (spanTag) => {
                    let s = spanTag;
                    if (!s.includes('truncate')) s = s.replace(/class=["']/, 'class="truncate max-w-[160px] xs:max-w-[200px] sm:max-w-none block ');
                    return s;
                });
                return b;
            });

            // Ensure <nav> is centered with mx-auto, has responsive gap, and does NOT collide with brand or CTAs
            h = h.replace(/(<nav\b[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, cls, p3) => {
                let c = cls;
                // Strip colliding and obsolete classes
                c = c.replace(/\bml-auto\b/g, '')
                     .replace(/\b(?:sm:|md:|lg:|xl:|2xl:)?mr-[0-9]+\b/g, '')
                     .replace(/\bshrink\b/g, '')
                     .replace(/\b(?:lg:|xl:|2xl:)?gap-[0-9]+\b/g, '')
                     .replace(/\bpx-[0-9]+\b/g, '')
                     .replace(/\b(?:lg:)?px-[0-9]+\b/g, '')
                     ;
                if (!c.includes('mx-auto')) c += ' mx-auto';
                if (!c.includes('justify-center')) c += ' justify-center';
                if (!c.includes('shrink-0')) c += ' shrink-0';
                c += ' gap-3 lg:gap-4 xl:gap-6 2xl:gap-6 px-2 lg:px-4';
                return `${p1}${c.replace(/\s+/g, ' ').trim()}${p3}`;
            });

            // Remove ml-auto from CTAs container so it doesn't push nav into the brand logo, while keeping shrink-0
            h = h.replace(/(<div\b[^>]*class=["'][^"']*(?:sm:flex|md:flex)[^"']*)(["'])/gi, (m, p1, p2) => {
                let c = p1.replace(/\bml-auto\b/g, '').replace(/\bpl-[0-9]+\b/g, '');
                if (!c.includes('shrink-0')) c += ' shrink-0';
                if (!c.includes('flex-nowrap')) c += ' flex-nowrap';
                return `${c.replace(/\s+/g, ' ').trim()}${p2}`;
            });

            // Add whitespace-nowrap to all links inside <nav> and collapse secondary links on narrow desktops
            h = h.replace(/(<nav[\s\S]*?<\/nav>)/gi, (navHtml) => {
                let n = navHtml;
                // Add whitespace-nowrap to every nav link
                n = n.replace(/(<a\b[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, cls, p3) => {
                    let c = cls;
                    if (!c.includes('whitespace-nowrap')) c = `${c} whitespace-nowrap shrink-0`;
                    return `${p1}${c.trim()}${p3}`;
                });
                // Ensure secondary links (why-us, faq, reviews, location) are hidden on lg/xl and visible only on 2xl
                n = n.replace(/(<a\b[^>]*href=["']#(?:why-us|faq|reviews|location)["'][^>]*class=["'])([^"']*)(["'])/gi, (m, p1, cls, p3) => {
                    let c = cls;
                    if (!c.includes('hidden') && !c.includes('2xl:inline-block')) {
                        c = `${c} hidden 2xl:inline-block`;
                    }
                    return `${p1}${c.trim()}${p3}`;
                });
                return n;
            });

            return h;
        });

        // 1C. Modernize Announcement Bar for Dark Aesthetic (Strictly scoped to the top announcement bar ribbon)
        html = html.replace(/(<(?:div|aside)[^>]*?(?:id=["']announcement-bar["']|class=["'][^"']*(?:text-xs|text-sm)[^"']*(?:LIMITED|OFFER|Limited|Offer)[^"']*["'])[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, cls, p3) => {
            let c = cls;
            if (!c.includes('w-full')) c = `w-full ${c}`;
            if (!c.includes('relative') && !c.includes('sticky')) c = `relative z-50 ${c}`;
            return `${p1}${c.trim()}${p3}`;
        });

        // Deduplicate redundant <style> blocks (e.g. Tailwind CSS outputs)
        const seenStyles = new Set();
        html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (match, content) => {
            const trimmed = content.trim();
            if (seenStyles.has(trimmed)) {
                return '';
            }
            seenStyles.add(trimmed);
            return match;
        });

        // 2. Ensure bottom mobile sticky bar has z-40 and all buttons have whitespace-nowrap
        html = html.replace(/(<div[^>]*class=["'][^"']*fixed\s+bottom-0[^"']*["'][^>]*>)([\s\S]*?)(<\/div>)/gi, (fullMatch, openTag, content, closeTag) => {
            let updatedOpenTag = openTag.replace(/z-(?:50|40|30|20)/g, 'z-40');
            if (!updatedOpenTag.includes('z-40')) updatedOpenTag = updatedOpenTag.replace(/class=["']/, 'class="z-40 ');

            // Check if there is a cart button in this mobile bottom bar
            const hasCart = /cart/i.test(content) && /<button|<a/i.test(content);
            if (hasCart) {
                // Extract cart button and move it to a floating action pill above the bottom bar
                const cartBtnMatch = content.match(/(<(?:button|a)[^>]*>[\s\S]*?cart[\s\S]*?<\/(?:button|a)>)/i);
                if (cartBtnMatch) {
                    const cartBtn = cartBtnMatch[1];
                    const contentWithoutCart = content.replace(cartBtn, '');
                    const floatingCart = `\n    <!-- Floating Cart Action Pill (Mobile) -->\n    <div id="floating-cart-pill" class="md:hidden fixed bottom-20 right-4 z-50 animate-bounce duration-1000">\n        <button onclick="toggleCartModal ? toggleCartModal() : (document.getElementById('cart-modal') ? document.getElementById('cart-modal').classList.toggle('hidden') : null)" class="bg-amber-500 hover:bg-amber-400 text-black font-extrabold px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 text-sm whitespace-nowrap border-2 border-white/20">\n            <i data-lucide="shopping-bag" class="w-4 h-4"></i>\n            <span>Cart (<span id="floating-cart-count">0</span>)</span>\n        </button>\n    </div>\n`;

                    const cleanContent = contentWithoutCart.replace(/(<(?:button|a)[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, cls, p3) => {
                        let c = cls;
                        if (!c.includes('whitespace-nowrap')) c = `${c} whitespace-nowrap`;
                        return `${p1}${c}${p3}`;
                    });

                    return `${floatingCart}${updatedOpenTag}${cleanContent}${closeTag}`;
                }
            }

            const cleanContent = content.replace(/(<(?:button|a)[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, cls, p3) => {
                let c = cls;
                if (!c.includes('whitespace-nowrap')) c = `${c} whitespace-nowrap`;
                return `${p1}${c}${p3}`;
            });

            return `${updatedOpenTag}${cleanContent}${closeTag}`;
        });

        // 3. Enforce mobile menu drawer styling: full-height off-canvas drawer (inset-y-0 right-0, z-[100])
        html = html.replace(
            /<div\s+[^>]*id=["'](mobile-(?:menu|drawer))["'][^>]*class=["']([^"']*)["'][^>]*>/gi,
            (match, idName, classes) => {
                const isLight = html.includes('bg-[#FAF9F6]') || html.includes('bg-[#FFFDF9]');
                let c = classes;
                c = c.replace(/\b(?:top-11|top-12|top-14|top-16)\b/g, '');
                c = c.replace(/\bsm:(?:top-11|top-12|top-14|top-16)\b/g, '');
                c = c.replace(/\b(?:bottom|right)\b(?!\S|-)/g, '');
                c = c.replace(/\b(?:bottom-0|right-0|inset-y-0|fixed)\b/g, '');
                c = c.replace(/\brounded-(?:tl|l|tr|r)-[a-z0-9]+\b/g, '');
                c = c.replace(/\bz-\[[^\]]*\]/g, '');
                c = c.replace(/\bz-[0-9]+\b/g, '');
                c = c.replace(/\btranslate-x-full\b/g, '');
                c = c.replace(/\btransform\b/g, '');
                c = c.replace(/\btransition(?:-[a-z0-9-]+)?\b/g, '');
                c = c.replace(/\bduration-[0-9]+\b/g, '');
                c = c.replace(/\bease-[a-z-]+\b/g, '');
                c = c.replace(/\blg:hidden\b/g, '');
                c = c.replace(/\s+/g, ' ').trim();

                const drawerTheme = isLight 
                    ? 'bg-[#FAF9F6] border-l border-[#D4AF37]/30 text-[#1A1A1A]' 
                    : 'bg-[#09090b] border-l border-zinc-800 text-white';

                const drawerClasses = `fixed inset-y-0 right-0 z-[100] w-full max-w-xs sm:max-w-sm ${drawerTheme} ${c} p-6 pt-5 flex flex-col justify-between shadow-2xl overflow-y-auto transform translate-x-full transition-transform duration-300 ease-in-out lg:hidden`;

                const seen = new Set();
                const deduplicated = drawerClasses.split(/\s+/).filter(token => {
                    if (!token || token === '-' || seen.has(token)) return false;
                    seen.add(token);
                    return true;
                }).join(' ');

                return `<div id="${idName}" class="${deduplicated}">`;
            }
        );

        // 4. Ensure backdrop overlay exists and has fixed inset-0
        if (html.includes('id="mobile-menu"') || html.includes('id="mobile-drawer"')) {
            if (!html.includes('id="menu-backdrop"')) {
                const backdropHtml = `\n    <!-- Mobile Menu Backdrop Overlay -->\n    <div id="menu-backdrop" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90] hidden transition-opacity duration-300"></div>\n`;
                html = html.replace(/(<div\s+[^>]*id=["']mobile-(?:menu|drawer)["'])/i, `${backdropHtml}$1`);
            } else {
                html = html.replace(
                    /(<div\s+[^>]*id=["']menu-backdrop["'][^>]*class=["'])([^"']*)(["'][^>]*>)/gi,
                    (m, p1, cls, p3) => {
                        let c = cls.replace(/\bfixed\s+inset\b(?!\S|-)/g, 'fixed inset-0');
                        if (!c.includes('inset-0')) c = `fixed inset-0 ${c}`;
                        if (!c.includes('z-[90]')) c = `${c} z-[90]`;
                        return `${p1}${c.replace(/\s+/g, ' ').trim()}${p3}`;
                    }
                );
            }
        }

        // 5. Card & Section Padding Normalization for Mobile Viewports
        // Solves mobile cramped cards where p-8 / p-12 eats up to 64px-96px of width on 360-400px screens
        // A. Compound responsive paddings
        html = html.replace(/\bp-8\s+sm:p-12\b/g, 'p-5 sm:p-8 lg:p-12');
        html = html.replace(/\bp-10\s+sm:p-14\b/g, 'p-6 sm:p-10 lg:p-14');
        html = html.replace(/\bp-12\s+sm:p-16\b/g, 'p-6 sm:p-10 lg:p-16');

        // B. Standalone oversized paddings without responsive prefix (using negative lookbehind)
        html = html.replace(/(?<![:\w-])p-8(?!\w)/g, 'p-5 sm:p-8');
        html = html.replace(/(?<![:\w-])p-10(?!\w)/g, 'p-6 sm:p-10');
        html = html.replace(/(?<![:\w-])p-12(?!\w)/g, 'p-6 sm:p-8 md:p-12');
        html = html.replace(/(?<![:\w-])p-16(?!\w)/g, 'p-6 sm:p-10 md:p-16');
        html = html.replace(/(?<![:\w-])px-8(?!\w)/g, 'px-5 sm:px-8');
        html = html.replace(/(?<![:\w-])px-10(?!\w)/g, 'px-5 sm:px-10');
        html = html.replace(/(?<![:\w-])px-12(?!\w)/g, 'px-6 sm:px-12');

        // 6. Clean Utility to Strip all conflicting Tailwind font-size, weights and empty breakpoint tokens
        const cleanFontAndSpacing = (cls) => {
            return cls
                // Remove all Tailwind text-size utilities with any breakpoint prefix (sm:text-..., md:text-..., text-...)
                .replace(/(?:^|\s)(?:[a-z0-9]+:)*text-(?:xs|sm|base|lg|xl|[2-9]xl)(?:\/[a-z0-9.-]+)?(?=\s|$)/gi, ' ')
                // Remove dangling prefixes like "sm: " or "md: "
                .replace(/(?:^|\s)[a-z0-9]+:\s*(?=\s|$)/gi, ' ')
                // Remove duplicate font weight tokens that we prepend
                .replace(/\bfont-(?:bold|extrabold|semibold|black)\b/gi, ' ')
                // Remove duplicate leading tokens that we prepend
                .replace(/\bleading-(?:none|tight|snug|normal|relaxed|loose|\[[^\]]+\])\b/gi, ' ')
                // Remove duplicate break-words and tracking
                .replace(/\bbreak-words\b/gi, ' ')
                .replace(/\btracking-(?:tighter|tight|normal|wide|wider|widest)\b/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        };

        // 7. Enforce Fluid Mobile & Desktop Typography on H1 (Hero Headlines)
        html = html.replace(/(<h1\b[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, classes, p3) => {
            const clean = cleanFontAndSpacing(classes);
            return `${p1}text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight tracking-tight break-words ${clean}${p3}`;
        });

        // 8. Enforce Wrap-Safe Fluid Mobile Typography on H2 (Section Headings)
        // Uses text-xl on mobile (<640px) which prevents letter clipping in cards and narrow viewports
        html = html.replace(/(<h2\b[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, classes, p3) => {
            const clean = cleanFontAndSpacing(classes);
            return `${p1}text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold leading-tight tracking-tight break-words ${clean}${p3}`;
        });

        // 9. Enforce Wrap-Safe Mobile Typography on H3 (Card & Feature Headings)
        html = html.replace(/(<h3\b[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, classes, p3) => {
            let c = classes;
            if (/text-(?:2xl|3xl|4xl|5xl)/.test(c)) {
                c = cleanFontAndSpacing(c);
                c = `text-lg sm:text-xl md:text-2xl font-bold leading-snug break-words ${c}`;
            } else if (!c.includes('break-words')) {
                c = `break-words ${c}`;
            }
            return `${p1}${c.replace(/\s+/g, ' ').trim()}${p3}`;
        });

        // 10. Global Typography & Distortion Guard Stylesheet Injection
        const typographyStyles = `
    <!-- ArcLane Responsive Typography & Distortion Prevention Guard -->
    <style>
      * {
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      h1, h2, h3, h4, h5, h6 {
        overflow-wrap: break-word;
        word-wrap: break-word;
        hyphens: auto;
      }
      img, svg, video, canvas, audio, iframe, embed, object {
        max-width: 100%;
        height: auto;
      }
    </style>`;

        if (!html.includes('ArcLane Responsive Typography & Distortion Prevention Guard')) {
            if (html.includes('<head>')) {
                html = html.replace('<head>', `<head>${typographyStyles}`);
            } else if (html.includes('<head ')) {
                html = html.replace(/(<head\s*[^>]*>)/i, `$1${typographyStyles}`);
            }
        }

        // 11. Ensure all custom fonts used in classes are loaded from Google Fonts
        if (html.includes('font-syne') && !html.includes('family=Syne')) {
            const syneFontTag = `\n    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&display=swap" rel="stylesheet">`;
            html = html.replace(/(<\/head>)/i, `${syneFontTag}\n$1`);
        }
        if (html.includes('font-outfit') && !html.includes('family=Outfit')) {
            const outfitFontTag = `\n    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">`;
            html = html.replace(/(<\/head>)/i, `${outfitFontTag}\n$1`);
        }

        // 12. Ensure Body and HTML have zero horizontal overflow and proper bottom clearance for mobile sticky action bar
        html = html.replace(/(<body\s+[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, classes, p3) => {
            let c = classes;
            // Normalize bottom padding to pb-20 md:pb-0 (tight clearance matching the 60px sticky action bar)
            c = c.replace(/\s*\bpb-(?:32|28|24|16)\b/g, '');
            if (!c.includes('pb-20') && !c.includes('pb-0')) {
                c = `pb-20 md:pb-0 ${c}`;
            } else if (c.includes('pb-20') && !c.includes('md:pb-0') && !c.includes('lg:pb-0')) {
                c = `${c} md:pb-0`;
            }
            if (!c.includes('overflow-x-hidden')) c = `overflow-x-hidden ${c}`;
            return `${p1}${c.trim()}${p3}`;
        });

        html = html.replace(/(<html\s+[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, classes, p3) => {
            let c = classes;
            if (!c.includes('overflow-x-hidden')) c = `overflow-x-hidden ${c}`;
            return `${p1}${c.trim()}${p3}`;
        });

        // 13. Fix Grid Column Overflow on Mobile
        // In a grid-cols-1 mobile layout, assigning 'col-span-12' forces browsers to generate 11 implicit columns
        // with gaps (e.g. 11 * 32px = 352px), overflowing narrow screens (360px-393px).
        // On mobile, items in 1-column grids must span 1 column.
        html = html.replace(/(?<![:\w-])col-span-(?:12|6|4|3|2)(?!\w)/g, 'col-span-1');

        // 13B. Deterministic Form Select & Dropdown Fluid Mobile Styling
        // Replaces native OS popups with appearance-none, inline SVG chevron, and strict parent container containment
        html = html.replace(/(<select\b[^>]*)(>)/gi, (fullSelect, openTag, closeTag) => {
            let s = openTag;
            if (!s.includes('appearance-none')) {
                s = s.replace(/(class=["'])/i, '$1appearance-none ');
            }
            if (!s.includes('max-w-full')) {
                s = s.replace(/(class=["'])/i, '$1max-w-full truncate ');
            }
            if (!s.includes('pr-10')) {
                s = s.replace(/(class=["'])/i, '$1pr-10 ');
            }
            if (!s.includes('background-image') && !s.includes('style=')) {
                s += ` style="background-image: url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'16\\' height=\\'16\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%239ca3af\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'%3E%3Cpath d=\\'m6 9 6 6 6-6\\'/%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: right 1rem center; background-size: 1.25rem;"`;
            }
            return `${s}${closeTag}`;
        });

        // 13C. Purge Conflicting Coordinate Classes on Badges (e.g. top-3 right-3 top-4 left-4)
        html = html.replace(/(<span\b[^>]*class=["'][^"']*\babsolute\b[^"']*["'][^>]*>)/gi, (badgeTag) => {
            return badgeTag.replace(/(class=["'])([^"']*)(["'])/i, (m, p1, cls, p3) => {
                const tokens = cls.split(/\s+/);
                const tops = tokens.filter(t => /^top-\d+$/.test(t));
                const bottoms = tokens.filter(t => /^bottom-\d+$/.test(t));
                const lefts = tokens.filter(t => /^left-\d+$/.test(t));
                const rights = tokens.filter(t => /^right-\d+$/.test(t));

                if (tops.length + bottoms.length > 1 || lefts.length + rights.length > 1) {
                    const filtered = tokens.filter(t => !/^-?(?:top|bottom|left|right)-\d+$/.test(t));
                    filtered.push('top-3', 'right-3');
                    return `${p1}${filtered.join(' ')}${p3}`;
                }
                return m;
            });
        });

        // 14. Deterministic Security Post-Processing (Zero-Vulnerability Guarantee)
        // A. Inject Strict Content-Security-Policy and Referrer-Policy into <head>
        const securityMetaTags = `
    <!-- ArcLane Zero-Vulnerability Security Headers -->
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' https: data: blob:; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' https:; frame-src 'self' https://www.google.com https://maps.google.com; object-src 'none'; base-uri 'self';">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <meta http-equiv="X-Content-Type-Options" content="nosniff">`;

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

        // 9. Universal Asset Normalization & Triple-Tier Image Fallbacks
        const defaultStockPhotos = {
            gym: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80',
            restaurant: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
            food: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80',
            cafe: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1200&q=80',
            clinic: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=1200&q=80',
            dental: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=1200&q=80',
            salon: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80',
            general: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80'
        };

        const bName = (businessName || '').toLowerCase();
        const fullText = (html + ' ' + bName).toLowerCase();
        let nicheFallback = defaultStockPhotos.general;

        if (bName.includes('gym') || bName.includes('fitness') || bName.includes('crossfit') || fullText.includes('gym') || fullText.includes('fitness')) {
            nicheFallback = defaultStockPhotos.gym;
        } else if (bName.includes('cafe') || bName.includes('coffee') || bName.includes('tea') || bName.includes('bistro')) {
            nicheFallback = defaultStockPhotos.cafe;
        } else if (bName.includes('restaurant') || bName.includes('dining') || bName.includes('kitchen') || bName.includes('food') || bName.includes('dhaba') || bName.includes('bhojnalaya') || fullText.includes('restaurant') || fullText.includes('curated menu') || fullText.includes('pizzas')) {
            nicheFallback = defaultStockPhotos.food;
        } else if (bName.includes('dental') || fullText.includes('dentist') || fullText.includes('dental clinic')) {
            nicheFallback = defaultStockPhotos.dental;
        } else if (bName.includes('clinic') || bName.includes('hospital') || bName.includes('doctor') || fullText.includes('clinic')) {
            nicheFallback = defaultStockPhotos.clinic;
        } else if (bName.includes('salon') || bName.includes('spa') || bName.includes('parlour') || fullText.includes('salon')) {
            nicheFallback = defaultStockPhotos.salon;
        }

        // A. Inject base tag and global image error recovery script
        if (slug) {
            const baseTag = `\n    <base href="/sites/${slug}/">\n    <script>
      window.addEventListener('error', function(e) {
        if (e.target && e.target.tagName === 'IMG') {
          var img = e.target;
          if (!img.dataset.hasFallenBack) {
            img.dataset.hasFallenBack = 'true';
            var src = img.getAttribute('src') || '';
            if (src.includes('assets/')) {
              var fName = src.split('assets/').pop();
              img.src = '/sites/${slug}/assets/' + fName;
              return;
            }
            img.src = '${nicheFallback}';
          }
        }
      }, true);
    </script>`;
            if (!html.includes('<base href=') && html.includes('<head>')) {
                html = html.replace('<head>', `<head>${baseTag}`);
            }
        }

        // B. Ensure all local ./assets/ images are rewritten to /sites/${slug}/assets/ AND have onerror fallback
        if (slug) {
            html = html.replace(/src=["'](?:\.\/)?assets\/([^"']+)["']/gi, (m, filename) => {
                return `src="/sites/${slug}/assets/${filename}"`;
            });

            // Restore authentic photos from photos_manifest.json if present
            const manifestPath = path.join(process.cwd(), 'web-dev-agency', 'public', 'sites', slug, 'assets', 'photos_manifest.json');
            if (fs.existsSync(manifestPath)) {
                try {
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                    if (manifest.hasRealPhotos) {
                        // Strip stock onerror fallbacks so authentic photos are permanent and never mutated to stock photos
                        html = html.replace(/\s*onerror=["']this\.onerror=null;\s*this\.src=['"]https:\/\/images\.unsplash\.com[^'"]+['"];?["']/gi, '');

                        // 1. Restore Hero Image
                        if (manifest.hero && manifest.hero.src) {
                            const heroFilename = manifest.hero.src.split('/').pop();
                            const heroUrl = `/sites/${slug}/assets/${heroFilename}`;
                            // Match hero img regardless of whether src or alt comes first
                            html = html.replace(/(<img\b(?=[^>]*\balt=["'][^"']*(?:hero|wide view|floor|gym|interior|exterior|entrance)[^"']*["'])[^>]*?\bsrc=["'])[^"']+["']/gi, `$1${heroUrl}"`);
                        }
                        // 2. Restore Gallery Images
                        if (manifest.gallery && manifest.gallery.length > 0) {
                            manifest.gallery.forEach((g) => {
                                const gFilename = g.src.split('/').pop();
                                const gUrl = `/sites/${slug}/assets/${gFilename}`;
                                const desc = (g.description || '').toLowerCase();
                                if (desc) {
                                    const words = desc.split(/[^a-zA-Z0-9]+/).filter(w => w.length > 3);
                                    words.forEach(w => {
                                        const re = new RegExp(`(<img\\b(?=[^>]*\\balt=["'][^"']*${w}[^"']*["'])[^>]*?\\bsrc=["'])[^"']+["']`, 'gi');
                                        html = html.replace(re, `$1${gUrl}"`);
                                    });
                                }
                            });
                        }
                    }
                } catch (e) {}
            }
        }

        // Clean out any stale data-has-fallen-back flags
        html = html.replace(/\s*data-has-fallen-back=["'][^"']*["']/gi, '');

        // 10. Intelligent Asset Accuracy & Fish Eradication Engine
        // Automatically replaces mismatched dish images (e.g. aquarium fish, barbecue ribs for potatoes, steak for red pasta)
        const isFoodVenue = /restaurant|cafe|dine|dining|kitchen|food|dhaba|bistro/i.test(businessName + ' ' + html.slice(0, 3000));
        if (isFoodVenue) {
            // Neutralize the fish URL globally across the HTML
            html = html.replace(/photo-1599488615731-7e5c2823ff28/g, 'photo-1555939594-58d7cb561ad1');

            // Parse each dish / menu-item card and ensure exact item-to-photo accuracy
            html = html.replace(/(<div[^>]*class=["'][^"']*(?:menu-item|dish-card|food-card)[^"']*["'][^>]*>[\s\S]*?<\/div>\s*<\/div>)/gi, (card) => {
                const titleMatch = card.match(/<h[34][^>]*>([^<]+)<\/h[34]>/i);
                if (titleMatch) {
                    const dishTitle = titleMatch[1].trim();
                    const correctUrl = resolveVerifiedFoodImage(dishTitle);
                    if (correctUrl) {
                        return card.replace(/(<img[^>]*src=["'])(https:\/\/images\.unsplash\.com\/[^"']+)(["'])/i, `$1${correctUrl}$3`);
                    }
                }
                return card;
            });
        }

        // 11. Clean Announcement Bar Ribbon (Strip accidental aspect-ratios or fixed heights)
        html = html.replace(/(<div[^>]*id=["']announcement-bar["'][^>]*>)/gi, (m) => {
            return m.replace(/(?:^|\s)(?:aspect-[^\s"']+|sm:aspect-[^\s"']+|h-(?:\[[^\]]+\]|[0-9]+)|sm:h-[^\s"']+|rounded-[^\s"']+)/g, '');
        });

        // 12. Standardize Google Maps iframes (full bleed within container)
        html = html.replace(/(<iframe[^>]*maps[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, cls, p3) => {
            let c = cls;
            if (!c.includes('w-full')) c = `w-full ${c}`;
            if (!c.includes('h-full')) c = `h-full ${c}`;
            if (!c.includes('border-0')) c = `border-0 ${c}`;
            if (!c.includes('block')) c = `block ${c}`;
            return `${p1}${c.replace(/\s+/g, ' ').trim()}${p3}`;
        });

        // 13. Zero-Redundancy Image & Asset Guard (Guarantees every visible image is unique)
        const seenImageSrcs = new Set();
        const nicheAssets = getVerifiedNicheAssets(businessName + ' ' + html.slice(0, 2000));
        const fallbackPool = [
            nicheAssets.hero,
            ...(nicheAssets.featured || []),
            ...(nicheAssets.gallery || [])
        ].filter(Boolean);

        let fallbackIdx = 0;

        html = html.replace(/(<img\b(?![^>]*\b(?:avatar|logo|icon|badge)\b)[^>]*?\bsrc=["'])([^"']+)(["'][^>]*>)/gi, (fullTag, openPart, src, closePart) => {
            const normalizedSrc = src.trim().split('?')[0]; // normalize query parameters
            if (seenImageSrcs.has(normalizedSrc)) {
                // Duplicate image detected! Find the next unused unique image from verified catalog
                let replacement = null;
                while (fallbackIdx < fallbackPool.length) {
                    const candidate = fallbackPool[fallbackIdx++];
                    const candNorm = candidate.split('?')[0];
                    if (!seenImageSrcs.has(candNorm) && candNorm !== normalizedSrc) {
                        replacement = candidate;
                        break;
                    }
                }
                if (replacement) {
                    seenImageSrcs.add(replacement.split('?')[0]);
                    return `${openPart}${replacement}${closePart}`;
                }
            }
            seenImageSrcs.add(normalizedSrc);
            return fullTag;
        });

        // 11. Enforce ArcLane Studios Agency Courtesy Credit (Brand Signature)
        html = injectAgencyCredit(html, businessName);

        // 12. Enforce Strict HTML Tag Closure & Structural Balancing
        // A. Repair broken </div without >
        html = html.replace(/<\/div(?![a-zA-Z0-9_>-])/gi, '</div>');

        // B. Repair inline mangled class="..."</div
        html = html.replace(/(class=["'][^"']*?["'])\s*<\/div/gi, '$1></div>');

        // C. Repair unclosed opening tags at line boundaries (<img ... or <div ...)
        html = html.replace(/(<[a-zA-Z0-9-]+(?:\s+[^>]*?)?["'])(?=\s*\r?\n\s*<)/gi, (match) => {
            if (!match.includes('>')) return match + '>';
            return match;
        });

        // D. Ensure all <img tags are closed with > before any child/sibling tag
        html = html.replace(/<img\b([^>]*?)(?=\s*<\/?(?:div|span|p|section|a|h[1-6]|ul|li|footer|header|aside)\b)/gi, (m, attrs) => {
            let a = attrs.trim();
            if (!a.endsWith('>')) {
                if ((a.match(/"/g) || []).length % 2 !== 0) a += '"';
                return `<img ${a}>`;
            }
            return m;
        });

        // E. Fix corrupted onerror double-quote nesting
        html = html.replace(/onerror=["']this\.onerror=null;\s*this\.src=["']([^"']+)["'];?["']/gi, (m, url) => {
            return `onerror="this.onerror=null; this.src='${url}';"`;
        });

        // F. Fix unclosed opening tags followed by inner text and unclosed closing tag (e.g. <span class="..."text</span)
        html = html.replace(/<([a-zA-Z0-9-]+)(\s+[^>]*?=["'][^"']*?["'])([^<>]*?)<\/\1(?![a-zA-Z0-9_>-])>?/gi, (m, tag, attrs, text) => {
            return `<${tag}${attrs}>${text}</${tag}>`;
        });

        // G. Fix empty unclosed tags (e.g. <i class="..."</i)
        html = html.replace(/<([a-zA-Z0-9-]+)(\s+[^>]*?=["'][^"']*?["'])<\/\1(?![a-zA-Z0-9_>-])>?/gi, (m, tag, attrs) => {
            return `<${tag}${attrs}></${tag}>`;
        });

        // H. Fix stray > after closing tags: e.g. </div>> -> </div>
        html = html.replace(/<\/(div|section|span|p|a|h[1-6]|header|footer|ul|li)>>+/gi, '</$1>');

        // I. Purge any orphaned empty responsive prefixes: e.g. sm: md: lg: xl: 2xl:
        html = html.replace(/\b(?:sm|md|lg|xl|2xl):\s+/g, '');

        // J. Protect script current-year textContent from throwing TypeError
        html = html.replace(/document\.getElementById\(['"]current-year['"]\)\.textContent\s*=\s*[^;]+;/gi, (m) => {
            return `const cyEl = document.getElementById('current-year'); if (cyEl) cyEl.textContent = new Date().getFullYear();`;
        });

        // K. Balance Div tags: ensure open divs match close divs
        const openDivs = (html.match(/<div\b/gi) || []).length;
        const closeDivs = (html.match(/<\/div>/gi) || []).length;
        const divDiff = openDivs - closeDivs;
        if (divDiff > 0) {
            const closingDivs = '</div>\n'.repeat(divDiff);
            if (html.includes('</body>')) {
                html = html.replace('</body>', `${closingDivs}</body>`);
            } else {
                html += closingDivs;
            }
        }

        return html;
    }
}



