import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { LLMClient } from './llm.js';

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
        const reportPath = path.join(this.reportsDir, `${clientId}.txt`);
        if (!fs.existsSync(reportPath)) {
            throw new Error(`Report file reports/${clientId}.txt not found. Please run /analyse first.`);
        }

        const reportContent = fs.readFileSync(reportPath, 'utf-8');

        // Extract Business Name
        let businessName = `Client ${clientId}`;
        const nameMatch = reportContent.match(/\*\*Business Name:\*\*\s*(.+)/i) || reportContent.match(/REPORT:\s*(.+)/i);
        if (nameMatch) {
            businessName = nameMatch[1].replace(/[*#]/g, '').trim();
        }

        // Failsafe: Check if client website is already built and live
        const reportsFinalPath = path.join(this.reportsDir, `final_${clientId}.txt`);
        if (fs.existsSync(reportsFinalPath) && !force) {
            const existingFinalContent = fs.readFileSync(reportsFinalPath, 'utf-8');
            const existingUrlMatch = existingFinalContent.match(/https:\/\/[a-zA-Z0-9-.]+\.vercel\.app/i);
            if (existingUrlMatch) {
                const liveUrl = existingUrlMatch[0];
                await this.sendStatus(`⏭️ *Lead ${clientId} (${businessName}) is already built & deployed!* \n\n` +
                    `🔗 *Live Website:* ${liveUrl}\n` +
                    `📄 *Final file:* \`final_${clientId}.txt\` is ready to dispatch.\n\n` +
                    `💡 *(To force rebuild from scratch, send: \`build_${clientId}.txt --force\`)*`);
                return {
                    clientId,
                    businessName,
                    deployedUrl: liveUrl,
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

        await this.sendStatus(`🚀 *[1/4] Generating Website Code for ${businessName}...*\nUsing Antigravity Prompt from reports/${clientId}.txt`);

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

        // 3. Save to generated_sites/<repoSlug>
        const repoSlug = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-website`.replace(/^-+|-+$/g, '');
        let githubRepoUrl = `https://github.com/ameyasharma-ai/${repoSlug}`;

        const clientSiteDir = path.join(this.sitesDir, repoSlug);
        if (!fs.existsSync(clientSiteDir)) {
            fs.mkdirSync(clientSiteDir, { recursive: true });
        }
        const htmlFilePath = path.join(clientSiteDir, 'index.html');
        fs.writeFileSync(htmlFilePath, htmlCode, 'utf-8');

        // Write package.json so Vercel registers the exact business name
        fs.writeFileSync(path.join(clientSiteDir, 'package.json'), JSON.stringify({ name: repoSlug, version: "1.0.0" }, null, 2), 'utf-8');

        await this.sendStatus(`✅ *[2/4] Code Generated Successfully!*\nSaved locally to \`generated_sites/${repoSlug}/index.html\``);

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
                const { stdout: ghOut } = await execAsync(`${ghBinary} repo create ameyasharma-ai/${repoSlug} --public --source=. --remote=origin --push`, { cwd: clientSiteDir });
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

        // 5. Deploy to Vercel
        let deployedUrl = "";
        try {
            const vercelCmd = process.env.VERCEL_TOKEN 
                ? `npx -y vercel --prod --yes --token ${process.env.VERCEL_TOKEN}`
                : `npx -y vercel --prod --yes`;

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
                    const { stdout: lsOut, stderr: lsErr } = await execAsync(`npx -y vercel project ls`, { timeout: 30000 });
                    const cleanLs = `${lsOut || ''}\n${lsErr || ''}`.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
                    const projectMatch = cleanLs.match(new RegExp(`${repoSlug}\\s+(https:\\/\\/[a-zA-Z0-9-]+\\.vercel\\.app)`, 'i'));
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

        // 6. Generate final_${clientId}.txt containing Target Contact Details & Outreach Messages with updated website URL
        let finalOutreachMessage = "";
        const outreachMatch = reportContent.match(/(\[CONTACT_DETAILS\][\s\S]*?)(?=\[AUDIT_START\]|$)/i);
        if (outreachMatch) {
            finalOutreachMessage = outreachMatch[1].trim();
        } else {
            const finalMessageMatch = reportContent.match(/(\[FINAL_OUTREACH_MESSAGE\][\s\S]*?)(?=\[AUDIT_START\]|$)/i);
            if (finalMessageMatch) {
                finalOutreachMessage = finalMessageMatch[1].trim();
            } else {
                // Fallback: extract email & whatsapp blocks
                const emailMatch = reportContent.match(/\[EMAIL_START\][\s\S]*?\[EMAIL_END\]/i);
                const waMatch = reportContent.match(/\[WHATSAPP_START\][\s\S]*?\[WHATSAPP_END\]/i);
                finalOutreachMessage = `[FINAL_OUTREACH_MESSAGE]\n\n${emailMatch ? emailMatch[0] : ''}\n\n${waMatch ? waMatch[0] : ''}`;
            }
        }

        // Replace [website-url] or previous vercel urls with newly deployed URL
        const updatedFinalMessage = finalOutreachMessage.replace(/\[website-url\]|https:\/\/[a-zA-Z0-9-.]+\.vercel\.app/g, deployedUrl);

        // Write reports/final_${clientId}.txt
        fs.writeFileSync(reportsFinalPath, updatedFinalMessage, 'utf-8');

        // 7. Update reports/${clientId}.txt research file with deployed URL
        const updatedReportContent = reportContent.replace(/\[website-url\]|https:\/\/[a-zA-Z0-9-.]+\.vercel\.app/g, deployedUrl);
        fs.writeFileSync(reportPath, updatedReportContent, 'utf-8');

        await this.sendStatus(`🎉 *[4/4] Website Built & Hosted Successfully!*\n\n` +
            `🔗 *Live Website:* ${deployedUrl}\n` +
            `📦 *GitHub Repo:* ${githubRepoUrl}\n` +
            `📄 *Created:* \`final_${clientId}.txt\` (Contains updated outreach messages)\n` +
            `📝 *Updated:* \`reports/${clientId}.txt\` (Replaced [website-url] with live link)`);

        // Send preview of final outreach message
        await this.sendStatus(`📋 *Ready-to-Send Outreach Preview:*\n\n\`\`\`\n${updatedFinalMessage}\n\`\`\``);

        return {
            clientId,
            businessName,
            deployedUrl,
            githubRepoUrl,
            reportsFinalPath
        };
    }
}

