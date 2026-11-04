/**
 * CLI Test Runner for Normal Scrape & Build (Micro-Batch)
 * Usage:
 *   node scripts/test_scrape_and_build.js [count] [query] [locality] [city]
 * Examples:
 *   node scripts/test_scrape_and_build.js 5
 *   node scripts/test_scrape_and_build.js 5 "Gyms" "Boring Road" "Patna"
 */

import 'dotenv/config';
import { ScraperRunner } from '../controller_bot/scraper_runner.js';
import { PipelineRunner } from '../controller_bot/pipeline_runner.js';

async function main() {
    const args = process.argv.slice(2);
    const targetLeads = parseInt(args[0] || '5', 10);
    const query = args[1] || 'Gyms';
    const locality = args[2] || 'in Boring Road';
    const city = args[3] || 'Patna';

    console.log('===========================================================');
    console.log(`🚀 CLI SCRAPE & BUILD TEST (${targetLeads} LEADS)`);
    console.log(`📍 Query: "${query}" | Locality: "${locality}" | City: "${city}"`);
    console.log('===========================================================');

    const mockBot = {
        telegram: {
            sendMessage: async (chatId, text) => {
                const clean = text.replace(/\*/g, '').replace(/_/g, '').replace(/`/g, '');
                console.log(`[Bot Message] ${clean}`);
            }
        }
    };

    const scraperRunner = new ScraperRunner(mockBot, 'cli_user');
    const pipelineRunner = new PipelineRunner(mockBot, 'cli_user');

    try {
        console.log('\n[Phase 1] Launching Streaming Scraper & Website Builder...');
        const result = await pipelineRunner.runStreamingScrapeAndBuild({
            query,
            locality: locality.startsWith('in ') ? locality : `in ${locality}`,
            city,
            targetLeads,
            scraperRunner
        });

        console.log('\n===========================================================');
        console.log('🎉 PIPELINE COMPLETED SUCCESSFULLY!');
        console.log(`• Leads Streamed: ${result.streamedCount || 0}`);
        console.log(`• Processed IDs: ${JSON.stringify(result.processedClientIds || [])}`);
        console.log('===========================================================');
    } catch (err) {
        console.error('❌ Pipeline failed:', err.message);
        process.exit(1);
    }
}

main();
