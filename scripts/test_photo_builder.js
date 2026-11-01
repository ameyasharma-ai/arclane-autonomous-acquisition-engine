/**
 * Test building a website using real Google Maps photos + Gemini Vision.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mapsPhotoCrawler } from '../src/engine/maps_photo_crawler.js';
import { mapsPhotoPipeline } from '../src/engine/maps_photo_pipeline.js';
import { LLMClient } from '../src/llm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testPhotoBuild() {
    console.log('===========================================================');
    console.log('🚀 TESTING REAL GOOGLE MAPS PHOTO EXTRACTION & AI CLASSIFICATION');
    console.log('===========================================================');

    // Test with Fitnation Gym (Lead #1)
    const businessName = 'FITNATION GYM';
    const industry = 'Gym & Fitness Studio';
    const mapsUrl = 'https://www.google.com/maps/place/FITNATION+GYM/data=!4m7!3m6!1s0x39ed598da53b109d:0xd5125e4e799b4157!8m2!3d25.6109372!4d85.1507557!16s%2Fg%2F11q8tx6r69!19sChIJnRA7pY1Z7TkRV0GbeU5eEtU?authuser=0&hl=en&g_ep=EgoyMDI2MTAyMC4wIJJjKgBIAVAD&rclk=1';
    const address = "Fitnation Gym 3rd Floor Ambition ojha Plaza Above Domino's Pizza, Kadamkuan, Patna";

    // Step 1: Crawl candidate photos
    console.log('\n[Step 1] Crawling candidate photos from Maps listing...');
    const candidateUrls = await mapsPhotoCrawler.fetchPhotosForBusiness(businessName, mapsUrl, address);
    await mapsPhotoCrawler.close();
    console.log(`Found ${candidateUrls.length} candidates:`, candidateUrls);

    if (candidateUrls.length === 0) {
        console.error('❌ No candidate photos found on Maps listing.');
        return;
    }

    // Step 2: AI Vision Classification
    console.log('\n[Step 2] Classifying photos with Gemini Vision...');
    const classified = await mapsPhotoPipeline.classifyPhotos(candidateUrls, businessName, industry);
    console.log('\nClassified Output:');
    console.log(JSON.stringify(classified, null, 2));

    // Step 3: Download & stage into test directory
    console.log('\n[Step 3] Downloading & staging assets into test directory...');
    const testSiteDir = path.join(__dirname, '..', 'generated_sites', 'test_photo_site');
    if (!fs.existsSync(testSiteDir)) {
        fs.mkdirSync(testSiteDir, { recursive: true });
    }

    const manifest = await mapsPhotoPipeline.downloadAndStageAssets(classified, testSiteDir);
    console.log('\nAsset Manifest:');
    console.log(JSON.stringify(manifest, null, 2));

    // Step 4: Verify downloaded files
    const assetsDir = path.join(testSiteDir, 'assets');
    const files = fs.readdirSync(assetsDir);
    console.log('\n[Step 4] Staged asset files on disk:');
    files.forEach(f => {
        const stats = fs.statSync(path.join(assetsDir, f));
        console.log(`  - ${f} (${stats.size} bytes)`);
    });

    console.log('\n🎉 SUCCESS: All steps passed! Ready for builder prompt integration.');
}

testPhotoBuild().catch(console.error);

