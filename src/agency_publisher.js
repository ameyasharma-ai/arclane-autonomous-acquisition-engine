import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { injectAgencyCredit } from './engine/agency_branding.js';

const execAsync = util.promisify(exec);

export class AgencyPublisher {
    constructor() {
        this.agencyDir = path.join(process.cwd(), 'web-dev-agency');
        this.agencyPublicSitesDir = path.join(this.agencyDir, 'public', 'sites');
        this.apexDomain = 'arclanestudios.space';
        this.batchQueue = [];
        this.batchThreshold = 5;
        this.isDeploying = false;
        this.domainLimitReached = false;
        this.registeredSubdomains = new Set();

        if (!fs.existsSync(this.agencyPublicSitesDir)) {
            fs.mkdirSync(this.agencyPublicSitesDir, { recursive: true });
        }
    }

    /**
     * Check if a specific subdomain is verified and active on Vercel without hitting the 50 domain limit
     */
    async isSubdomainActive(slug) {
        if (this.domainLimitReached) {
            return false;
        }
        const fullDomain = `${slug}.${this.apexDomain}`;
        if (this.registeredSubdomains.has(fullDomain)) {
            return true;
        }
        const vercelToken = process.env.VERCEL_TOKEN;
        if (!vercelToken) return false;

        const projectId = 'prj_bDQewUJReqeKlYBNwvDPcO6vamOZ';
        const teamId = 'team_7pHeotFcK2tW9w7oom9czThz';
        try {
            const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/domains?teamId=${teamId}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${vercelToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: fullDomain })
            });
            const data = await res.json();
            if (data.error) {
                if (data.error.code === 'project_domain_limit_reached') {
                    console.warn(`[AgencyPublisher] ⚠️ Vercel 50-domain project limit reached. Switching to Agency Hosted URLs.`);
                    this.domainLimitReached = true;
                    return false;
                }
                return false;
            }
            this.registeredSubdomains.add(fullDomain);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Use Gemini AI to pick an ultra-clean, short, branded subdomain slug
     * e.g. "Pulse 8 gym the unisex" -> "pulse8" or "pulse8gym"
     * e.g. "FITNATION GYM" -> "fitnation"
     */
    async getSlug(businessName, clientId = null) {
        // 1. If lead already has an established slug in outreach.json or on disk, preserve it deterministically
        if (clientId) {
            const outreachJsonPath = path.join(process.cwd(), 'reports', String(clientId), 'outreach.json');
            if (fs.existsSync(outreachJsonPath)) {
                try {
                    const parsed = JSON.parse(fs.readFileSync(outreachJsonPath, 'utf8'));
                    if (parsed.slug) return parsed.slug;
                    if (parsed.deployedUrl) {
                        const m = parsed.deployedUrl.match(/\/sites\/([a-zA-Z0-9-]+)/) || parsed.deployedUrl.match(/https?:\/\/([a-zA-Z0-9-]+)\./);
                        if (m && m[1] && m[1] !== 'www') return m[1];
                    }
                } catch (e) {}
            }
        }

        try {
            if (process.env.API) {
                const OpenAI = (await import('openai')).default;
                const client = new OpenAI({
                    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
                    apiKey: process.env.API,
                });
                const prompt = `Given the business name: "${businessName}", pick an ultra-short, premium, branded subdomain slug.
Rules:
- Keep it 1 to 2 words max (ideally just the core brand name, e.g. "pulse8", "fitnation", "gymone").
- Strip out fluff words like "the unisex", "pvt ltd", "centre", "patna", "official".
- Output ONLY the clean lowercase slug (letters, numbers, single hyphens). No punctuation, no markdown, no quotes.`;

                const res = await client.chat.completions.create({
                    model: 'gemini-flash-lite-latest',
                    messages: [{ role: 'user', content: prompt }]
                });
                const rawSlug = res.choices[0].message.content.trim().toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '');
                if (rawSlug && rawSlug.length >= 3 && rawSlug.length <= 20) {
                    return rawSlug;
                }
            }
        } catch (e) {
            console.log(`[AgencyPublisher] AI slug picker notice (${e.message}), using fallback.`);
        }

        // Clean deterministic fallback
        return businessName
            .toLowerCase()
            .replace(/\b(the|unisex|gym|fitness|center|centre|club|patna|pvt|ltd)\b/gi, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'client-site';
    }

    /**
     * Compute canonical public Subdomain URL
     */
    getSubdomainUrl(slug) {
        return `https://${slug}.${this.apexDomain}`;
    }

    /**
     * Compute canonical main agency path URL (hosted at arclane)
     */
    getAgencyPathUrl(slug) {
        return `https://www.arclanestudios.space/sites/${slug}`;
    }

    /**
     * Stage a newly built site HTML into web-dev-agency/public/sites/<slug>/index.html
     */
    async stageSite(clientId, businessName, htmlCode) {
        const slug = await this.getSlug(businessName, clientId);
        const targetDir = path.join(this.agencyPublicSitesDir, slug);

        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const targetHtmlPath = path.join(targetDir, 'index.html');
        // Permanently stamp ArcLane agency courtesy credit in footer
        const finalHtml = injectAgencyCredit(htmlCode, businessName);
        fs.writeFileSync(targetHtmlPath, finalHtml, 'utf-8');

        const subdomainUrl = this.getSubdomainUrl(slug);
        const agencyPathUrl = this.getAgencyPathUrl(slug);
        const deployedUrl = agencyPathUrl; // Canonical working URL on Vercel

        // Add to batch tracking
        this.batchQueue.push({
            clientId: Number(clientId),
            businessName,
            slug,
            deployedUrl,
            subdomainUrl,
            agencyPathUrl
        });

        console.log(`[AgencyPublisher] Staged Lead #${clientId} (${businessName}) -> /public/sites/${slug}/index.html`);
        return {
            slug,
            deployedUrl,
            subdomainUrl,
            agencyPathUrl,
            stagedPath: targetHtmlPath
        };
    }

    /**
     * Check if a batch deployment should be triggered
     */
    shouldDeployBatch() {
        return this.batchQueue.length >= this.batchThreshold;
    }

    /**
     * Compute canonical public Audit Report URL
     */
    getAuditReportUrl(clientId) {
        return `https://www.arclanestudios.space/reports/${clientId}`;
    }

    /**
     * Stage generated audit report markdown and metadata into web-dev-agency/public/reports/<clientId>/
     */
    stageReport(clientId, auditMarkdown, outreachJson = null) {
        const reportsDir = path.join(this.agencyDir, 'public', 'reports', String(clientId));
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        if (auditMarkdown) {
            fs.writeFileSync(path.join(reportsDir, 'audit.md'), auditMarkdown, 'utf-8');
        }
        if (outreachJson) {
            fs.writeFileSync(path.join(reportsDir, 'outreach.json'), JSON.stringify(outreachJson, null, 2), 'utf-8');
        }

        const reportUrl = this.getAuditReportUrl(clientId);
        console.log(`[AgencyPublisher] Staged Audit Report for Lead #${clientId} -> /public/reports/${clientId}/audit.md (${reportUrl})`);
        return reportUrl;
    }

    /**
     * Flush and deploy batch of sites by pushing to GitHub
     * (Vercel builds automatically from GitHub push)
     */
    async deployBatch(statusCallback = null) {
        if (this.batchQueue.length === 0) {
            return { deployed: 0 };
        }

        if (this.isDeploying) {
            console.log(`[AgencyPublisher] Deployment already in progress. Skipping duplicate run.`);
            return { inProgress: true };
        }

        this.isDeploying = true;
        const currentBatch = [...this.batchQueue];
        const count = currentBatch.length;

        try {
            if (statusCallback) {
                await statusCallback(`🚀 *[Batch Deployer] Syncing ${count} new client sites & reports to arclanestudios.space...*`);
            }

            // 1. Stage and commit both sites and reports in web-dev-agency
            await execAsync(`git add public/sites/ public/reports/`, { cwd: this.agencyDir });
            
            const clientList = currentBatch.map(c => c.slug).join(', ');
            const commitMsg = `feat(sites): add batch of ${count} client sites [${clientList}]`;

            try {
                await execAsync(`git commit -m "${commitMsg}"`, { cwd: this.agencyDir });
            } catch (commitErr) {
                // If nothing new to commit, proceed
                console.log(`[AgencyPublisher] Commit note:`, commitErr.message);
            }

            // 2. Pull remote changes with rebase first to guarantee clean non-fast-forward push
            try {
                await execAsync(`git pull --rebase origin main`, { cwd: this.agencyDir });
            } catch (pullErr) {
                console.warn(`[AgencyPublisher] Pull rebase note:`, pullErr.message);
            }

            // 3. Push to GitHub
            await execAsync(`git push origin main`, { cwd: this.agencyDir });
            console.log(`[AgencyPublisher] Successfully pushed batch of ${count} sites to GitHub!`);

            // 4. Instant SSL Guarantee: Register specific subdomains with Vercel API
            const vercelToken = process.env.VERCEL_TOKEN;
            if (vercelToken && !this.domainLimitReached) {
                const projectId = 'prj_bDQewUJReqeKlYBNwvDPcO6vamOZ';
                const teamId = 'team_7pHeotFcK2tW9w7oom9czThz';
                for (const item of currentBatch) {
                    try {
                        const domainName = `${item.slug}.${this.apexDomain}`;
                        const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/domains?teamId=${teamId}`, {
                            method: 'POST',
                            headers: {
                                Authorization: `Bearer ${vercelToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ name: domainName })
                        });
                        const data = await res.json();
                        if (data.error && data.error.code === 'project_domain_limit_reached') {
                            console.warn(`[AgencyPublisher] ⚠️ Vercel domain limit (50) reached during batch deployment. Falling back gracefully to agency hosted routes.`);
                            this.domainLimitReached = true;
                            break;
                        }
                        if (!data.error) {
                            this.registeredSubdomains.add(domainName);
                            console.log(`[AgencyPublisher] Instant SSL enabled on Vercel for ${domainName}`);
                        }
                    } catch (dErr) {
                        // Wildcard fallback if API fails
                    }
                }
            }

            // Clear processed items from batchQueue
            this.batchQueue = this.batchQueue.filter(item => !currentBatch.includes(item));

            if (statusCallback) {
                await statusCallback(`✅ *[Batch Deployer] ${count} client sites pushed live!*\n` +
                    `🌐 Sites active under \`https://www.arclanestudios.space/sites/*\``);
            }

            return {
                deployed: count,
                batch: currentBatch
            };
        } catch (err) {
            console.error(`[AgencyPublisher] ❌ Failed to deploy batch:`, err.message);
            if (statusCallback) {
                await statusCallback(`⚠️ *[Batch Deployer Error]:* ${err.message}`);
            }
            throw err;
        } finally {
            this.isDeploying = false;
        }
    }

    /**
     * Clear all hosted client demo websites and restore agency to pristine baseline
     * Removes all directories in web-dev-agency/public/sites/, commits, and pushes to GitHub/Vercel.
     */
    async clearHostedWebsites(statusCallback = null) {
        try {
            if (statusCallback) {
                await statusCallback(`🧹 *[AgencyPublisher] Clearing all hosted client websites...*`);
            }

            // 1. Remove all subdirectories in web-dev-agency/public/sites/
            if (fs.existsSync(this.agencyPublicSitesDir)) {
                const entries = fs.readdirSync(this.agencyPublicSitesDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        const targetPath = path.join(this.agencyPublicSitesDir, entry.name);
                        fs.rmSync(targetPath, { recursive: true, force: true });
                    }
                }
                // Ensure a baseline .gitkeep exists so the directory remains tracked
                fs.writeFileSync(path.join(this.agencyPublicSitesDir, '.gitkeep'), '');
            }

            // Reset batch queue
            this.batchQueue = [];

            // 2. Commit & Push to GitHub to trigger Vercel rebuild to baseline
            try {
                await execAsync(`git add -A public/sites/`, { cwd: this.agencyDir });
                await execAsync(`git commit -m "chore(sites): restore agency website to clean baseline"`, { cwd: this.agencyDir });
                await execAsync(`git push origin main`, { cwd: this.agencyDir });
                console.log(`[AgencyPublisher] Successfully pushed clean baseline to GitHub.`);
            } catch (gitErr) {
                console.log(`[AgencyPublisher] Git baseline commit note:`, gitErr.message);
            }

            if (statusCallback) {
                await statusCallback(`✅ *[AgencyPublisher] Hosted client sites cleared. Agency website reset to baseline!*`);
            }

            return { success: true };
        } catch (err) {
            console.error(`[AgencyPublisher] Failed to clear hosted websites:`, err);
            throw err;
        }
    }
}

export const agencyPublisher = new AgencyPublisher();
