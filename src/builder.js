import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { LLMClient } from './llm.js';
import { loadGoogleSheet, updateLeadFields } from './sheets.js';

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
        if (this.telegramBot && this.chatId) {
            try {
                await this.telegramBot.telegram.sendMessage(this.chatId, msg, { parse_mode: 'Markdown' });
            } catch (e) {
                // Fallback without markdown in case message has unescaped characters
                try {
                    await this.telegramBot.telegram.sendMessage(this.chatId, msg);
                } catch (err) {
                    console.error("Failed to send telegram status:", err.message);
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

        // Vercel & GitHub project name (clean business slug with NO "website" suffix)
        const vercelSlug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        let githubRepoUrl = `https://github.com/ameyasharma-ai/${vercelSlug}`;

        // Write package.json so Vercel registers the exact clean business name
        fs.writeFileSync(path.join(clientSiteDir, 'package.json'), JSON.stringify({ name: vercelSlug, version: "1.0.0" }, null, 2), 'utf-8');

        await this.sendStatus(`✅ *[2/4] Code Generated Successfully!*\nSaved locally to \`generated_sites/${clientId}/index.html\``);

        // 4. Git & GitHub Hosting
        await this.sendStatus(`📦 *[3/4] Publishing to GitHub & Deploying to Vercel...*`);
        try {
            await execAsync(`git init`, { cwd: clientSiteDir });
            await execAsync(`git add .`, { cwd: clientSiteDir });
            try {
                await execAsync(`git commit -m "Initial commit for ${businessName}"`, { cwd: clientSiteDir });
            } catch (cErr) {
                // Commit already up to date
            }
            
            const ghBinary = fs.existsSync("C:\\Program Files\\GitHub CLI\\gh.exe") 
                ? `"C:\\Program Files\\GitHub CLI\\gh.exe"` 
                : "gh";

            try {
                const { stdout: ghOut } = await execAsync(`${ghBinary} repo create ameyasharma-ai/${vercelSlug} --public --source=. --remote=origin --push`, { cwd: clientSiteDir });
                const ghMatch = ghOut.match(/https:\/\/github\.com\/[^\s]+/);
                if (ghMatch) githubRepoUrl = ghMatch[0];
            } catch (ghErr) {
                try {
                    await execAsync(`git push -u origin master`, { cwd: clientSiteDir });
                } catch (pushErr) {
                    try {
                        await execAsync(`git push -u origin main`, { cwd: clientSiteDir });
                    } catch (pushErr2) {
                        console.log("GitHub push notice:", pushErr2.message);
                    }
                }
            }
        } catch (e) {
            console.log("Git local commit notice:", e.message);
        }

        // 5. Deploy to Vercel (Ensure project name is the business slug)
        let deployedUrl = "";
        try {
            const tokenFlag = process.env.VERCEL_TOKEN ? `--token ${process.env.VERCEL_TOKEN}` : '';
            
            // Ensure Vercel project exists under the business slug
            try {
                await execAsync(`npx -y vercel project add ${vercelSlug} ${tokenFlag}`, { cwd: clientSiteDir, timeout: 30000 });
            } catch (pErr) {
                // Project may already exist or error can be ignored
            }

            // Write vercel.json configuration as secondary safeguard
            fs.writeFileSync(path.join(clientSiteDir, 'vercel.json'), JSON.stringify({ name: vercelSlug }, null, 2), 'utf-8');

            const vercelCmd = `npx -y vercel --prod --yes --project ${vercelSlug} ${tokenFlag}`.trim();
            const { stdout, stderr } = await execAsync(vercelCmd, { cwd: clientSiteDir, timeout: 60000 });

            // Combine stdout and stderr (Vercel CLI prints progress & Aliased domain to stderr)
            const combinedOutput = `${stdout || ''}\n${stderr || ''}`;
            const cleanOutput = combinedOutput.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
            const aliasMatch = cleanOutput.match(/Aliased\s+(https:\/\/[a-zA-Z0-9-]+\.vercel\.app)/i);

            if (aliasMatch) {
                deployedUrl = aliasMatch[1].trim();
            } else {
                // Fetch exact production domain from Vercel project list
                try {
                    const { stdout: lsOut, stderr: lsErr } = await execAsync(`npx -y vercel project ls ${tokenFlag}`.trim(), { timeout: 30000 });
                    const cleanLs = `${lsOut || ''}\n${lsErr || ''}`.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
                    const projectMatch = cleanLs.match(new RegExp(`${vercelSlug}\\s+(https:\\/\\/[a-zA-Z0-9-]+\\.vercel\\.app)`, 'i'));
                    if (projectMatch) {
                        deployedUrl = projectMatch[1].trim();
                    }
                } catch (lsErr) {
                    console.log("Project list fetch notice:", lsErr.message);
                }
            }
        } catch (e) {
            console.error(`Vercel deployment notice (${e.message}).`);
        }

        if (!deployedUrl) {
            throw new Error(`Could not determine public Vercel production URL for ${businessName}. Please verify Vercel CLI credentials.`);
        }

        // 6. Generate structured & formatted reports in reports/<clientId>/
        if (!fs.existsSync(clientReportsDir)) {
            fs.mkdirSync(clientReportsDir, { recursive: true });
        }

        // Extract WhatsApp message
        let waMessage = "";
        const waMatch = reportContent.match(/\[WHATSAPP_START\]([\s\S]*?)\[WHATSAPP_END\]/i);
        if (waMatch) {
            waMessage = waMatch[1].trim().replace(/\[website-url\]|https:\/\/[a-zA-Z0-9-.]+\.vercel\.app/g, deployedUrl);
        }

        // Extract Call Script
        let callScript = "";
        const callMatch = reportContent.match(/\[CALL_SCRIPT_START\]([\s\S]*?)\[CALL_SCRIPT_END\]/i);
        if (callMatch) {
            callScript = callMatch[1].trim().replace(/\[website-url\]|https:\/\/[a-zA-Z0-9-.]+\.vercel\.app/g, deployedUrl);
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

        // Construct structured JSON
        const outreachJson = {
            clientId: Number(clientId),
            businessName,
            phone,
            whatsapp: whatsappPhone,
            deployedUrl,
            githubRepoUrl,
            whatsappMessage: waMessage,
            callScript: callScript,
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(outreachJsonPath, JSON.stringify(outreachJson, null, 2), 'utf-8');

        // Construct human-readable outreach text
        const outreachTxt = `[CONTACT_DETAILS]\nPhone: ${phone || 'Not available.'}\nWhatsApp: ${whatsappPhone || 'Not available.'}\n\n[OUTREACH_PLATFORM]\nWhatsApp & Follow-up Phone Call\n\n[FINAL_OUTREACH_MESSAGE]\n\n[WHATSAPP_START]\n${waMessage}\n[WHATSAPP_END]\n\n[CALL_SCRIPT_START]\n${callScript}\n[CALL_SCRIPT_END]`;
        fs.writeFileSync(path.join(clientReportsDir, 'outreach.txt'), outreachTxt, 'utf-8');
        fs.writeFileSync(clientFinalPath, outreachTxt, 'utf-8');

        // Update audit.md with live deployed URL
        const updatedReportContent = reportContent.replace(/\[website-url\]|https:\/\/[a-zA-Z0-9-.]+\.vercel\.app/g, deployedUrl);
        fs.writeFileSync(auditMdPath, updatedReportContent, 'utf-8');

        // Update Google Sheet with Website URL & Status
        try {
            const { sheet } = await loadGoogleSheet();
            await updateLeadFields(sheet, Number(clientId), {
                'Website URL': deployedUrl,
                'Current Status': 'Website Built'
            });
        } catch (sheetErr) {
            console.error("Sheet update notice:", sheetErr.message);
        }

        await this.sendStatus(`🎉 *[4/4] Website Built & Hosted Successfully!*\n\n` +
            `🔗 *Live Website:* ${deployedUrl}\n` +
            `📦 *GitHub Repo:* ${githubRepoUrl}\n` +
            `📁 *Local Site:* \`generated_sites/${clientId}/\`\n` +
            `📄 *Structured Report:* \`reports/${clientId}/outreach.json\``);

        // Send preview of final outreach message
        await this.sendStatus(`📋 *Ready-to-Send WhatsApp Outreach Preview:*\n\n\`\`\`\n${waMessage}\n\`\`\``);

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

        return html;
    }
}


