import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export class AgencyPublisher {
    constructor() {
        this.agencyDir = path.join(process.cwd(), 'web-dev-agency');
        this.agencyPublicSitesDir = path.join(this.agencyDir, 'public', 'sites');
        this.apexDomain = 'arclanestudios.space';
        this.batchQueue = [];
        this.batchThreshold = 5;
        this.isDeploying = false;

        if (!fs.existsSync(this.agencyPublicSitesDir)) {
            fs.mkdirSync(this.agencyPublicSitesDir, { recursive: true });
        }
    }

    /**
     * Compute clean subdomain slug from business name
     */
    getSlug(businessName) {
        return businessName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'client-site';
    }

    /**
     * Compute canonical public URL
     */
    getSubdomainUrl(slug) {
        return `https://${slug}.${this.apexDomain}`;
    }

    /**
     * Stage a newly built site HTML into web-dev-agency/public/sites/<slug>/index.html
     */
    stageSite(clientId, businessName, htmlCode) {
        const slug = this.getSlug(businessName);
        const targetDir = path.join(this.agencyPublicSitesDir, slug);

        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const targetHtmlPath = path.join(targetDir, 'index.html');
        fs.writeFileSync(targetHtmlPath, htmlCode, 'utf-8');

        const deployedUrl = this.getSubdomainUrl(slug);

        // Add to batch tracking
        this.batchQueue.push({
            clientId: Number(clientId),
            businessName,
            slug,
            deployedUrl
        });

        console.log(`[AgencyPublisher] Staged Lead #${clientId} (${businessName}) -> /public/sites/${slug}/index.html`);
        return {
            slug,
            deployedUrl,
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
                await statusCallback(`🚀 *[Batch Deployer] Syncing ${count} new client sites to arclanestudios.space...*`);
            }

            // 1. Stage and commit in web-dev-agency
            await execAsync(`git add public/sites/`, { cwd: this.agencyDir });
            
            const clientList = currentBatch.map(c => c.slug).join(', ');
            const commitMsg = `feat(sites): add batch of ${count} client sites [${clientList}]`;

            try {
                await execAsync(`git commit -m "${commitMsg}"`, { cwd: this.agencyDir });
            } catch (commitErr) {
                // If nothing new to commit, proceed
                console.log(`[AgencyPublisher] Commit note:`, commitErr.message);
            }

            // 2. Push to GitHub
            await execAsync(`git push origin main`, { cwd: this.agencyDir });
            console.log(`[AgencyPublisher] Successfully pushed batch of ${count} sites to GitHub!`);

            // Clear processed items from batchQueue
            this.batchQueue = this.batchQueue.filter(item => !currentBatch.includes(item));

            if (statusCallback) {
                await statusCallback(`✅ *[Batch Deployer] ${count} client sites pushed live!*\n` +
                    `🌐 Domains active under \`*.arclanestudios.space\``);
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
}

export const agencyPublisher = new AgencyPublisher();
