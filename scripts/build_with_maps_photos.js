/**
 * Build or Rebuild a Client Website using Real Google Maps Photos + Gemini Vision.
 * 
 * Usage:
 *   node scripts/build_with_maps_photos.js <clientId> [--force]
 *   node scripts/build_with_maps_photos.js 1 --force
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mapsPhotoCrawler } from '../src/engine/maps_photo_crawler.js';
import { mapsPhotoPipeline } from '../src/engine/maps_photo_pipeline.js';
import { WebsiteBuilder } from '../src/builder.js';
import { agencyPublisher } from '../src/agency_publisher.js';
import { loadGoogleSheet } from '../src/sheets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    const args = process.argv.slice(2);
    const clientIdArg = args[0] || '1';
    const force = args.includes('--force');

    const clientId = Number(clientIdArg);
    if (!clientId || isNaN(clientId)) {
        console.error('Usage: node scripts/build_with_maps_photos.js <clientId> [--force]');
        process.exit(1);
    }

    console.log('===========================================================');
    console.log(`📸 BUILDING LEAD #${clientId} WITH REAL GOOGLE MAPS PHOTOS`);
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
                    'Address': r.get('Address'),
                    'Google Maps URL': r.get('Google Maps URL') || r.get('Maps URL') || r.get('URL'),
                };
            }
        } catch (e) {
            console.warn('[Notice] Sheet lookup:', e.message);
        }
    }

    if (!lead) {
        console.error(`❌ Could not find lead #${clientId} in latest export or Google Sheet.`);
        process.exit(1);
    }

    const businessName = lead['Business Name'] || `Client ${clientId}`;
    const industry = lead['Industry/Niche'] || 'Commercial';
    const address = lead['Address'] || '';
    const mapsUrl = lead['Google Maps URL'] || lead['Maps URL'] || lead['URL'] || '';

    console.log(`🏢 Business: "${businessName}"`);
    console.log(`🏷️ Niche: ${industry}`);
    console.log(`📍 Address: ${address}`);
    console.log(`🗺️ Maps URL: ${mapsUrl || '(Will search by name & address)'}`);

    // 2. Crawl Photos from Google Maps
    console.log('\n[Phase 1] Crawling candidate photos from Google Maps...');
    const candidateUrls = await mapsPhotoCrawler.fetchPhotosForBusiness(businessName, mapsUrl, address);
    await mapsPhotoCrawler.close();

    if (candidateUrls.length === 0) {
        console.warn('⚠️ No candidate photos found on Google Maps. Falling back to stock assets.');
    } else {
        console.log(`✅ Extracted ${candidateUrls.length} candidate photo URLs from Google Maps.`);
    }

    // 3. Classify with Gemini Vision
    console.log('\n[Phase 2] Analyzing and classifying photos with Gemini Vision...');
    const classified = await mapsPhotoPipeline.classifyPhotos(candidateUrls, businessName, industry);

    // 4. Determine Destination Directories
    const slug = await agencyPublisher.getSlug(businessName);
    const agencySiteDir = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites', slug);
    const clientSiteDir = path.join(__dirname, '..', 'generated_sites', String(clientId));
    const reportsClientDir = path.join(__dirname, '..', 'reports', String(clientId));

    if (!fs.existsSync(agencySiteDir)) fs.mkdirSync(agencySiteDir, { recursive: true });
    if (!fs.existsSync(clientSiteDir)) fs.mkdirSync(clientSiteDir, { recursive: true });
    if (!fs.existsSync(reportsClientDir)) fs.mkdirSync(reportsClientDir, { recursive: true });

    // 5. Download and Stage Assets
    console.log(`\n[Phase 3] Downloading authentic photos to local site assets...`);
    const agencyManifest = await mapsPhotoPipeline.downloadAndStageAssets(classified, agencySiteDir);
    const clientManifest = await mapsPhotoPipeline.downloadAndStageAssets(classified, clientSiteDir);

    // Save manifest in reports folder as well
    fs.writeFileSync(
        path.join(reportsClientDir, 'photos_manifest.json'),
        JSON.stringify(agencyManifest, null, 2),
        'utf8'
    );

    // 6. Build the Website with Builder
    console.log(`\n[Phase 4] Invoking WebsiteBuilder with authentic photo prompt injection...`);
    const builder = new WebsiteBuilder();
    const result = await builder.buildClientWebsite(clientId, true); // force=true to rebuild with real photos

    console.log('\n===========================================================');
    console.log(`🎉 COMPLETED! Lead #${clientId} (${businessName}) rebuilt with REAL photos!`);
    console.log(`🔗 Live Agency URL: ${result.deployedUrl}`);
    console.log(`📦 Local Site: ${agencySiteDir}`);
    console.log('===========================================================');
}

main().catch(err => {
    console.error('Fatal error in build_with_maps_photos:', err);
    process.exit(1);
});
