import fs from 'fs';
import path from 'path';
import { PipelineRunner } from './pipeline_runner.js';
import { ScraperRunner } from './scraper_runner.js';
import { loadGoogleSheet } from '../src/sheets.js';

const BATCH_LOG = path.join(process.cwd(), 'logs', 'acquisition_batch_run.log');
function log(msg) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}`;
    console.log(line);
    fs.appendFileSync(BATCH_LOG, line + '\n', 'utf8');
}

async function runAutonomousAcquisitionCampaign() {
    log('===========================================================');
    log('🚀 RESUMING 425 -> 500 AUTONOMOUS ACQUISITION CAMPAIGN');
    log('===========================================================');

    const { sheet } = await loadGoogleSheet();
    let currentRows = (await sheet.getRows()).length;
    log(`Current verified rows in Google Sheet: ${currentRows}`);

    // Remaining batches to hit 500 (from 425 -> 75 leads remaining):
    // 1. Complete Banquet & Highway Theme Restaurants (Day 13): 24 leads (425 -> 449)
    // 2. Digital QR Menu Demos & Weekend Closer Waves (Day 14): 33 leads (449 -> 482)
    // 3. Dental Clinics & Implant Centers in Patna (Day 15): 18 leads (482 -> 500)
    const batches = [
        {
            dayNumber: 13,
            focus: "Banquet & Highway Theme Restaurants in Patna (Completion)",
            query: "Dine In Restaurants",
            locality: "in Patna",
            city: "Patna",
            targetLeads: 24
        },
        {
            dayNumber: 14,
            focus: "Digital QR Menu Demos & Weekend Closer Waves",
            query: "Restaurants",
            locality: "in Patna",
            city: "Patna",
            targetLeads: 33
        },
        {
            dayNumber: 15,
            focus: "Dental Clinics & Implant Centers in Patna",
            query: "Dental Clinics",
            locality: "in Patna",
            city: "Patna",
            targetLeads: 33
        }
    ];

    log(`Loaded ${batches.length} remaining batches to hit exactly 500 total leads.`);

    const scraperRunner = new ScraperRunner();
    const pipelineRunner = new PipelineRunner();

    let batchIndex = 0;
    for (const b of batches) {
        batchIndex++;
        currentRows = (await sheet.getRows()).length;
        if (currentRows >= 500) {
            log(`🎯 TARGET ALREADY REACHED! Total verified leads: ${currentRows}/500. Stopping.`);
            break;
        }

        const remainingTo500 = 500 - currentRows;
        const batchTarget = Math.min(b.targetLeads, remainingTo500);

        log(`\n-----------------------------------------------------------`);
        log(`▶️ STARTING BATCH ${batchIndex}/${batches.length}: "${b.focus}"`);
        log(`   Query: "${b.query}", Locality: "${b.locality}", Target: ${batchTarget} leads (Need ${remainingTo500} to reach 500)`);
        log(`-----------------------------------------------------------`);

        try {
            await pipelineRunner.runStreamingScrapeAndBuild({
                query: b.query,
                locality: b.locality,
                city: b.city,
                targetLeads: batchTarget,
                scraperRunner
            });

            const refreshedRows = (await sheet.getRows()).length;
            log(`✅ COMPLETED BATCH ${batchIndex}/${batches.length}: "${b.focus}"`);
            log(`📊 CRM Lead Count Now: ${refreshedRows}/500`);

            if (refreshedRows >= 500) {
                log(`🎯 TARGET REACHED! ${refreshedRows} total leads in CRM. Halting campaign.`);
                break;
            }
        } catch (err) {
            log(`❌ ERROR in Batch ${batchIndex} (${b.focus}): ${err.message}`);
            log(err.stack || '');
            log(`Pausing 10s before attempting next batch safely...`);
            await new Promise(r => setTimeout(r, 10000));
        }
    }

    const finalCount = (await sheet.getRows()).length;
    log('\n===========================================================');
    log(`🏁 CAMPAIGN COMPLETE! Final CRM Row Count: ${finalCount}`);
    log('===========================================================');
}

runAutonomousAcquisitionCampaign().catch(err => {
    log(`FATAL RUNNER FAILURE: ${err.message}`);
    process.exit(1);
});
