import fs from 'fs';
import path from 'path';

// 1. Update src/web_ui.js to include fix & build in isControlOrStatus
const webUiPath = path.join(process.cwd(), 'src', 'web_ui.js');
let webUiCode = fs.readFileSync(webUiPath, 'utf8');

const oldControlRegex = /const isControlOrStatus = \['status', 'today', 'help', 'start', 'abort', 'stop', 'reset_plan', 'resume_plan', 'coverage', 'view_plan', 'metrics'\]\.includes\(rawCmd\);/;
const newControlCode = `const isControlOrStatus = ['status', 'today', 'help', 'start', 'abort', 'stop', 'reset_plan', 'resume_plan', 'coverage', 'view_plan', 'metrics', 'fix', 'build', 'fix_lead', 'build_lead', 'rebuild'].includes(rawCmd);`;

if (oldControlRegex.test(webUiCode)) {
    webUiCode = webUiCode.replace(oldControlRegex, newControlCode);
    fs.writeFileSync(webUiPath, webUiCode, 'utf8');
    console.log('✅ Updated src/web_ui.js to whitelist /fix and /build commands');
} else {
    console.warn('⚠️ Could not find oldControlRegex in src/web_ui.js');
}

// 2. Add /fix and /build handlers to controller_bot/index.js
const botIndexPath = path.join(process.cwd(), 'controller_bot', 'index.js');
let botCode = fs.readFileSync(botIndexPath, 'utf8');

const fixCommandHandler = `
// ==========================================
// Command: /fix <clientId> or /build <clientId>
// Fixes or builds a specific lead with the new Vision AI & Verified Asset Engine
// ==========================================
async function handleFixLead(ctx) {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    if (ctx.chat?.id) scheduler.setChatId(ctx.chat.id);

    const text = ctx.message?.text || '';
    const match = text.match(/(?:\\/fix|\\/build|\\/build_lead|\\/rebuild|fix|build)\\s+(\\d+)/i);
    const clientId = match ? parseInt(match[1], 10) : parseInt(text.split(' ')[1], 10);

    if (!clientId || isNaN(clientId)) {
        return ctx.reply("❌ Please provide a valid Client ID.\\n\\nExample: \`/fix 202\` or \`/build 202\`", { parse_mode: 'Markdown' });
    }

    await ctx.reply(\`🧠 *Starting Vision AI Fix for Lead #\${clientId}...*\\n_Extracting photos, running Gemini Vision filtering, and rebuilding with verified design standards._\`, { parse_mode: 'Markdown' });

    try {
        const { loadGoogleSheet } = await import('../src/sheets.js');
        const { mapsPhotoCrawler } = await import('../src/engine/maps_photo_crawler.js');
        const { mapsPhotoPipeline } = await import('../src/engine/maps_photo_pipeline.js');
        const { agencyPublisher } = await import('../src/agency_publisher.js');
        const { WebsiteBuilder } = await import('../src/builder.js');
        const fsMod = await import('fs');
        const pathMod = await import('path');

        let lead = null;
        const latestJsonPath = pathMod.join(process.cwd(), 'data_exports', 'crm_leads_latest.json');
        if (fsMod.existsSync(latestJsonPath)) {
            try {
                const allLeads = JSON.parse(fsMod.readFileSync(latestJsonPath, 'utf8'));
                lead = allLeads.find(l => Number(l['Client ID']) === clientId);
            } catch (e) {}
        }

        if (!lead) {
            try {
                const { sheet } = await loadGoogleSheet();
                const rows = await sheet.getRows();
                const r = rows.find(row => Number(row.get('Client ID')) === clientId);
                if (r) {
                    lead = {
                        'Client ID': clientId,
                        'Business Name': r.get('Business Name'),
                        'Industry/Niche': r.get('Industry/Niche'),
                        'Address': r.get('Address'),
                        'Google Maps URL': r.get('Google Maps URL') || r.get('Maps URL') || r.get('URL')
                    };
                }
            } catch (e) {}
        }

        const businessName = lead?.['Business Name'] || \`Lead \${clientId}\`;
        const industry = lead?.['Industry/Niche'] || 'Commercial';
        const address = lead?.['Address'] || '';
        const mapsUrl = lead?.['Google Maps URL'] || '';

        await ctx.reply(\`📍 *Business:* \`\${businessName}\` (\${industry})\\n_Fetching authentic candidate photos from Google Maps..._\`, { parse_mode: 'Markdown' });

        // Crawl candidate photos
        let candidateUrls = [];
        try {
            candidateUrls = await mapsPhotoCrawler.fetchPhotosForBusiness(businessName, mapsUrl, address);
            await mapsPhotoCrawler.close();
        } catch (crawlErr) {
            console.warn('[FixLead] Crawl notice:', crawlErr.message);
        }

        // Classify with Gemini Vision
        await ctx.reply(\`📸 Analyzing \${candidateUrls.length} candidate photos with Gemini Vision...\`);
        const classified = await mapsPhotoPipeline.classifyPhotos(candidateUrls, businessName, industry);

        // Stage clean assets
        const slug = await agencyPublisher.getSlug(businessName);
        const agencySiteDir = pathMod.join(agencyPublisher.agencyPublicSitesDir, slug);
        const clientSiteDir = pathMod.join(process.cwd(), 'generated_sites', String(clientId));
        const reportsClientDir = pathMod.join(process.cwd(), 'reports', String(clientId));

        // Purge old discarded assets
        [agencySiteDir, clientSiteDir, reportsClientDir].forEach(dir => {
            const assetsDir = pathMod.join(dir, 'assets');
            if (fsMod.existsSync(assetsDir)) {
                ['hero.jpg', 'gallery-1.jpg'].forEach(badFile => {
                    const p = pathMod.join(assetsDir, badFile);
                    if (fsMod.existsSync(p) && classified.useStockForHero) {
                        try { fsMod.unlinkSync(p); } catch (e) {}
                    }
                });
            }
        });

        await mapsPhotoPipeline.downloadAndStageAssets(classified, agencySiteDir);
        await mapsPhotoPipeline.downloadAndStageAssets(classified, clientSiteDir);
        const stagedManifest = await mapsPhotoPipeline.downloadAndStageAssets(classified, reportsClientDir);

        fsMod.writeFileSync(pathMod.join(reportsClientDir, 'photos_manifest.json'), JSON.stringify(stagedManifest, null, 2), 'utf8');

        // Rebuild website
        await ctx.reply(\`🔨 Rebuilding website with Split-Hero Showcase, 2-Button Mobile Bar & Verified Assets...\`);
        const builder = new WebsiteBuilder(bot, ctx.chat.id);
        const result = await builder.buildClientWebsite(clientId, true);

        await ctx.reply(\`🎉 *Lead #\${clientId} (\${businessName}) Fixed Successfully!*\\n\\n\` +
            \`🔗 *Live Agency URL:* \${result.deployedUrl}\\n\` +
            \`📦 *Local Directory:* \`web-dev-agency/public/sites/\${slug}/index.html\`\\n\` +
            \`📸 *Authentic Assets:* \${stagedManifest.featured?.length || 0} verified photos staged.\`,
            { parse_mode: 'Markdown' }
        );
    } catch (err) {
        console.error('[FixLead] Error:', err);
        ctx.reply(\`❌ Failed to fix Lead #\${clientId}: \${err.message}\`);
    }
}

bot.command('fix', handleFixLead);
bot.command('build', handleFixLead);
bot.command('fix_lead', handleFixLead);
bot.command('build_lead', handleFixLead);
bot.command('rebuild', handleFixLead);
`;

const anchor = '// Direct text listener: Automatically detect when user pastes a Google Maps link into chat';
if (botCode.includes(anchor)) {
    botCode = botCode.replace(anchor, `${fixCommandHandler}\n${anchor}`);
    fs.writeFileSync(botIndexPath, botCode, 'utf8');
    console.log('✅ Added /fix and /build handlers to controller_bot/index.js');
} else {
    console.warn('⚠️ Could not find anchor in controller_bot/index.js');
}
