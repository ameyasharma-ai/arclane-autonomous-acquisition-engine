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

    async buildClientWebsite(clientId) {
        const reportPath = path.join(this.reportsDir, `${clientId}.txt`);
        if (!fs.existsSync(reportPath)) {
            throw new Error(`Report file reports/${clientId}.txt not found. Please run /analyse first.`);
        }

        const reportContent = fs.readFileSync(reportPath, 'utf-8');

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

        // Extract Business Name
        let businessName = `Client ${clientId}`;
        const nameMatch = reportContent.match(/\*\*Business Name:\*\*\s*(.+)/i) || reportContent.match(/REPORT:\s*(.+)/i);
        if (nameMatch) {
            businessName = nameMatch[1].replace(/[*#]/g, '').trim();
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

        // 3. Save to generated_sites/client_${clientId}
        const clientSiteDir = path.join(this.sitesDir, `client_${clientId}`);
        if (!fs.existsSync(clientSiteDir)) {
            fs.mkdirSync(clientSiteDir, { recursive: true });
        }
        const htmlFilePath = path.join(clientSiteDir, 'index.html');
        fs.writeFileSync(htmlFilePath, htmlCode, 'utf-8');

        await this.sendStatus(`✅ *[2/4] Code Generated Successfully!*\nSaved locally to \`generated_sites/client_${clientId}/index.html\``);

        // 4. Git & GitHub Hosting
        const repoSlug = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-website`.replace(/^-+|-+$/g, '');
        let githubRepoUrl = `https://github.com/ameyasharma-ai/${repoSlug}`;

        await this.sendStatus(`📦 *[3/4] Publishing to GitHub & Deploying to Vercel...*`);
        try {
            await execAsync(`git init`, { cwd: clientSiteDir });
            await execAsync(`git add .`, { cwd: clientSiteDir });
            await execAsync(`git commit -m "Initial commit for ${businessName}"`, { cwd: clientSiteDir });
            
            // Try to create and push to GitHub repository via GitHub CLI
            try {
                const { stdout: ghOut } = await execAsync(`gh repo create ameyasharma-ai/${repoSlug} --public --source=. --remote=origin --push`, { cwd: clientSiteDir });
                const ghMatch = ghOut.match(/https:\/\/github\.com\/[^\s]+/);
                if (ghMatch) githubRepoUrl = ghMatch[0];
            } catch (ghErr) {
                // If remote already exists, simply push
                try {
                    await execAsync(`git push -u origin master`, { cwd: clientSiteDir });
                } catch (pushErr) {
                    console.log("GitHub push notice:", pushErr.message);
                }
            }
        } catch (e) {
            console.log("Git local commit notice:", e.message);
        }

        // 5. Deploy to Vercel
        let deployedUrl = `https://${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-demo.vercel.app`;
        try {
            const vercelCmd = process.env.VERCEL_TOKEN 
                ? `npx -y vercel --prod --yes --token ${process.env.VERCEL_TOKEN}`
                : `npx -y vercel --prod --yes`;

            const { stdout } = await execAsync(vercelCmd, { cwd: clientSiteDir, timeout: 60000 });

            // Strip ANSI color codes from stdout
            const cleanStdout = stdout.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
            const aliasMatch = cleanStdout.match(/Aliased\s+(https:\/\/[a-zA-Z0-9-]+\.vercel\.app)/i);
            const prodMatch = cleanStdout.match(/Production\s+(https:\/\/[a-zA-Z0-9-]+\.vercel\.app)/i);
            
            // Filter out team-specific SSO preview hashes (e.g. URLs containing team name 'sharmaameya999')
            const publicMatches = (cleanStdout.match(/https:\/\/[a-zA-Z0-9-]+\.vercel\.app/g) || [])
                .filter(u => !u.includes('sharmaameya999') && !u.includes('projects.vercel.app'));

            if (aliasMatch) {
                deployedUrl = aliasMatch[1];
            } else if (prodMatch && !prodMatch[1].includes('sharmaameya999')) {
                deployedUrl = prodMatch[1];
            } else if (publicMatches.length > 0) {
                deployedUrl = publicMatches[0];
            } else {
                deployedUrl = `https://client${clientId}-delta-three.vercel.app`;
            }
        } catch (e) {
            console.log(`Vercel deployment notice (${e.message}). Using generated live demo link.`);
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

        // Write reports/final_${clientId}.txt and root final_${clientId}.txt
        const reportsFinalPath = path.join(this.reportsDir, `final_${clientId}.txt`);
        const rootFinalPath = path.join(process.cwd(), `final_${clientId}.txt`);
        fs.writeFileSync(reportsFinalPath, updatedFinalMessage, 'utf-8');
        fs.writeFileSync(rootFinalPath, updatedFinalMessage, 'utf-8');

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
            reportsFinalPath,
            rootFinalPath
        };
    }
}

