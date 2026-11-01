import fs from 'fs';
import path from 'path';

const builderPath = path.join(process.cwd(), 'src', 'builder.js');
let content = fs.readFileSync(builderPath, 'utf8');

// 1. Add imports if missing
if (!content.includes('mapsPhotoCrawler')) {
    const importTarget = "import { agencyPublisher } from './agency_publisher.js';";
    const importReplacement = `import { agencyPublisher } from './agency_publisher.js';\nimport { mapsPhotoCrawler } from './engine/maps_photo_crawler.js';\nimport { mapsPhotoPipeline } from './engine/maps_photo_pipeline.js';`;
    content = content.replace(importTarget, importReplacement);
}

// 2. Add autonomous crawl before checking manifest
const checkTarget = `// Check for authentic Google Maps photos manifest
        const photosManifestPath = path.join(clientReportsDir, 'photos_manifest.json');
        let hasAuthenticPhotos = false;`;

const enhancedSnippet = `// Check for authentic Google Maps photos manifest (or autonomous crawl)
        const photosManifestPath = path.join(clientReportsDir, 'photos_manifest.json');
        let hasAuthenticPhotos = false;

        // Autonomous Google Maps Photo Extraction & Vision Classification for any new lead
        if (!fs.existsSync(photosManifestPath)) {
            try {
                let mapsUrl = '';
                const mapsMatch = reportContent.match(/(?:Google Maps URL|Maps URL|Listing URL):\\s*([^\\n\\r]+)/i);
                if (mapsMatch) mapsUrl = mapsMatch[1].trim();

                let address = '';
                const addrMatch = reportContent.match(/(?:Address|Full Address):\\s*([^\\n\\r]+)/i);
                if (addrMatch) address = addrMatch[1].trim();

                let industry = 'Commercial';
                const indMatch = reportContent.match(/(?:Industry|Niche|Vertical):\\s*([^\\n\\r]+)/i);
                if (indMatch) industry = indMatch[1].trim();

                console.log(\`[Builder] 📸 Autonomous Google Maps Photo Pipeline running for "\${businessName}"...\`);
                await this.sendStatus(\`📸 *Extracting real Google Maps photos for \${businessName}...*\`);

                const candidateUrls = await mapsPhotoCrawler.fetchPhotosForBusiness(businessName, mapsUrl, address);
                await mapsPhotoCrawler.close();

                if (candidateUrls.length > 0) {
                    await this.sendStatus(\`🧠 *Classifying \${candidateUrls.length} real photos with Gemini Vision for \${businessName}...*\`);
                    const classified = await mapsPhotoPipeline.classifyPhotos(candidateUrls, businessName, industry);

                    const slug = await agencyPublisher.getSlug(businessName);
                    const agencySiteDir = path.join(agencyPublisher.agencyPublicSitesDir, slug);
                    const clientSiteDir = path.join(this.sitesDir, String(clientId));

                    await mapsPhotoPipeline.downloadAndStageAssets(classified, clientReportsDir);
                    await mapsPhotoPipeline.downloadAndStageAssets(classified, agencySiteDir);
                    await mapsPhotoPipeline.downloadAndStageAssets(classified, clientSiteDir);
                    console.log(\`[Builder] ✅ Real photos extracted & staged for \${businessName}\`);
                } else {
                    console.log(\`[Builder] ℹ️ Zero Maps photos found for \${businessName}, falling back to verified stock.\`);
                }
            } catch (crawlErr) {
                console.warn(\`[Builder] Auto-crawl photo notice: \${crawlErr.message}\`);
            }
        }`;

if (content.includes(checkTarget)) {
    content = content.replace(checkTarget, enhancedSnippet);
    fs.writeFileSync(builderPath, content, 'utf8');
    console.log('✅ Successfully enhanced src/builder.js with autonomous Google Maps photo crawling!');
} else {
    console.error('❌ checkTarget not found in src/builder.js');
}

