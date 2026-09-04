import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import dotenv from 'dotenv';
dotenv.config();

const execAsync = util.promisify(exec);

const sitesToDeploy = [
    { id: 514, slug: 'my-fitness-zone-gym-website' },
    { id: 515, slug: 'f-z-gym-fitness-website' },
    { id: 516, slug: 'abs-fitness-gym-website' },
    { id: 517, slug: 'xtreme-fitness-gym-website' },
    { id: 518, slug: 'muscle-fitness-gym-website' },
    { id: 519, slug: 'the-fitness-gym-website' },
    { id: 520, slug: 'king-s-gym-website' },
    { id: 521, slug: 'gymnation-the-fitness-hub-website' },
    { id: 522, slug: 'power-house-gym-the-complete-unisex-gym-website' },
    { id: 511, slug: 'george-restaurant-website' },
    { id: 5, slug: 'global-gym-website' },
    { id: 7, slug: 'fitness-icon-website' }
];

async function deploySites() {
    console.log(`Starting Vercel & GitHub deployment for ${sitesToDeploy.length} websites...`);
    const results = [];

    for (const site of sitesToDeploy) {
        const siteDir = path.join(process.cwd(), 'generated_sites', site.slug);
        if (!fs.existsSync(siteDir)) {
            console.log(`⚠️ Directory not found: ${site.slug}`);
            continue;
        }

        console.log(`\n========================================`);
        console.log(`🚀 [Client ${site.id}] Deploying ${site.slug}...`);
        console.log(`========================================`);

        // 1. Git add & commit
        try {
            await execAsync(`git add .`, { cwd: siteDir });
            try {
                await execAsync(`git commit -m "Fix transparent menu and ensure 100% solid header"`, { cwd: siteDir });
            } catch (cErr) {}

            try {
                await execAsync(`git push origin main`, { cwd: siteDir });
            } catch (pErr) {
                try {
                    await execAsync(`git push origin master`, { cwd: siteDir });
                } catch (pErr2) {}
            }
        } catch (gitErr) {
            console.log(`Git notice: ${gitErr.message}`);
        }

        // 2. Vercel deploy
        const vercelCmd = process.env.VERCEL_TOKEN 
            ? `npx -y vercel --prod --yes --token ${process.env.VERCEL_TOKEN}`
            : `npx -y vercel --prod --yes`;

        let deployedUrl = '';
        try {
            const { stdout, stderr } = await execAsync(vercelCmd, { cwd: siteDir, timeout: 60000 });
            const combined = `${stdout || ''}\n${stderr || ''}`;
            const clean = combined.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
            const aliasMatch = clean.match(/Aliased\s+(https:\/\/[a-zA-Z0-9-]+\.vercel\.app)/i) ||
                               clean.match(/Production:\s+(https:\/\/[a-zA-Z0-9-]+\.vercel\.app)/i) ||
                               clean.match(/(https:\/\/[a-zA-Z0-9-]+\.vercel\.app)/i);
            if (aliasMatch) {
                deployedUrl = aliasMatch[1].trim();
            }
            console.log(`✅ Deployed ${site.slug} -> ${deployedUrl}`);
            results.push({ id: site.id, slug: site.slug, status: 'SUCCESS', url: deployedUrl });
        } catch (vErr) {
            console.error(`❌ Vercel error on ${site.slug}:`, vErr.message);
            results.push({ id: site.id, slug: site.slug, status: 'FAILED', error: vErr.message });
        }
    }

    console.log("\n========================================");
    console.log("🎉 ALL DEPLOYMENTS COMPLETE!");
    console.log("========================================");
    console.log(JSON.stringify(results, null, 2));
}

deploySites().catch(console.error);
