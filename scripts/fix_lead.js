/**
 * CLI Visual Fixer for Lead Sites
 * Usage: node scripts/fix_lead.js <clientId> [--rebuild]
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { visualQualityGate } from '../src/engine/visual_quality_gate.js';
import { WebsiteBuilder } from '../src/builder.js';
import { agencyPublisher } from '../src/agency_publisher.js';
import { loadGoogleSheet } from '../src/sheets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fixLead() {
    const args = process.argv.slice(2);
    const clientId = Number(args[0] || '4');
    const rebuild = !args.includes('--no-rebuild');

    console.log('===========================================================');
    console.log(`🔧 RUNNING VISUAL FIXER FOR LEAD #${clientId}`);
    console.log('===========================================================');

    // 1. Locate Lead Data
    let lead = null;
    const latestJsonPath = path.join(__dirname, '..', 'data_exports', 'crm_leads_latest.json');
    if (fs.existsSync(latestJsonPath)) {
        try {
            const allLeads = JSON.parse(fs.readFileSync(latestJsonPath, 'utf8'));
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
                    'Address': r.get('Address')
                };
            }
        } catch (e) {}
    }

    const businessName = lead?.['Business Name'] || `Lead ${clientId}`;
    const slug = await agencyPublisher.getSlug(businessName, clientId);
    console.log(`🏢 Business: "${businessName}"`);
    console.log(`🔗 Slug: ${slug}`);

    const agencyHtmlPath = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites', slug, 'index.html');
    const clientHtmlPath = path.join(__dirname, '..', 'generated_sites', String(clientId), 'index.html');

    const builder = new WebsiteBuilder();

    let htmlCode = '';
    let finalSlug = slug;
    if (rebuild || !fs.existsSync(agencyHtmlPath)) {
        console.log(`\n[Phase 1] Full rebuild triggered via WebsiteBuilder...`);
        const buildResult = await builder.buildClientWebsite(clientId, true);
        finalSlug = buildResult?.slug || slug;
        const actualAgencyPath = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites', finalSlug, 'index.html');
        if (fs.existsSync(actualAgencyPath)) {
            htmlCode = fs.readFileSync(actualAgencyPath, 'utf8');
        } else if (fs.existsSync(clientHtmlPath)) {
            htmlCode = fs.readFileSync(clientHtmlPath, 'utf8');
        }
    } else {
        console.log(`\n[Phase 1] Reading existing staged HTML from ${agencyHtmlPath}...`);
        htmlCode = fs.readFileSync(agencyHtmlPath, 'utf8');
        
        console.log(`\n[Phase 2] Applying deterministic Design Quality Standards...`);
        htmlCode = builder.enforceDesignQualityStandards(htmlCode, slug, businessName);

        console.log(`\n[Phase 3] Running Automated Pre-Flight Visual Quality Gate (Playwright DOM surgery)...`);
        const auditResult = await visualQualityGate.auditAndFix(htmlCode, slug, businessName);
        console.log(`✅ Visual Quality Gate fixed ${auditResult.issuesFixed.length} layout issues:\n  - ${auditResult.issuesFixed.join('\n  - ')}`);
        htmlCode = auditResult.cleanHtml;

        // Save cleaned HTML to both locations
        fs.writeFileSync(agencyHtmlPath, htmlCode, 'utf8');
        if (fs.existsSync(path.dirname(clientHtmlPath))) {
            fs.writeFileSync(clientHtmlPath, htmlCode, 'utf8');
        }

        // Stage into agency publisher batch
        await agencyPublisher.stageSite(clientId, businessName, htmlCode);

        // Deploy to Vercel and GitHub
        console.log(`\n[Phase 4] Deploying fixed site to Vercel & GitHub...`);
        await agencyPublisher.deployBatch((msg) => console.log(msg));
    }

    console.log('\n===========================================================');
    console.log(`🎉 COMPLETED! Lead #${clientId} (${businessName}) fixed & deployed!`);
    console.log(`🔗 Live Agency URL: https://www.arclanestudios.space/sites/${finalSlug}`);
    console.log('===========================================================');

    await visualQualityGate.close();
}

fixLead().catch(err => {
    console.error('Fatal error in fix_lead:', err);
    process.exit(1);
});

