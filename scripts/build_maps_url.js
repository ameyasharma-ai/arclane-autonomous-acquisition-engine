/**
 * CLI Instant Maps URL Builder & Deployer
 * Usage: node scripts/build_maps_url.js "<GoogleMapsUrl>"
 */
import 'dotenv/config';
import { instantMapsBuilder } from '../src/engine/instant_maps_builder.js';

async function main() {
    const mapsUrl = process.argv[2];
    if (!mapsUrl) {
        console.error("❌ Please provide a Google Maps URL.");
        console.log("Usage: node scripts/build_maps_url.js \"https://maps.app.goo.gl/...\"");
        process.exit(1);
    }

    console.log("===========================================================");
    console.log("🚀 INSTANT GOOGLE MAPS LEAD BUILDER & DEPLOYER");
    console.log("===========================================================");

    try {
        const result = await instantMapsBuilder.processMapsUrl(mapsUrl, {
            notify: (msg) => console.log(msg.replace(/\*/g, '').replace(/_/g, ''))
        });
        console.log("===========================================================");
        console.log(`🎉 SUCCESS! Client ID #${result.clientId} (${result.businessName}) built & deployed!`);
        console.log(`🔗 Live Agency URL: ${result.deployedUrl}`);
        console.log("===========================================================");
        process.exit(0);
    } catch (err) {
        console.error("❌ Pipeline failed:", err.message);
        process.exit(1);
    }
}

main();
