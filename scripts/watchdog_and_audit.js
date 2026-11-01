import fs from 'fs';
import path from 'path';
import { loadGoogleSheet } from '../src/sheets.js';
import { downloadCrmSnapshot } from './export_full_crm.js';
import { runFullAudit } from './run_leads_audit.js';

const BATCH_LOG = path.join(process.cwd(), 'logs', 'acquisition_batch_run.log');
function log(msg) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}`;
    console.log(line);
    fs.appendFileSync(BATCH_LOG, line + '\n', 'utf8');
}

async function monitorUntil500AndAudit() {
    log('===========================================================');
    log('👀 WATCHDOG ENGAGED: MONITORING CAMPAIGN UNTIL 500 TOTAL LEADS');
    log('===========================================================');

    const { sheet } = await loadGoogleSheet();
    let currentRows = (await sheet.getRows()).length;
    log(`Starting Watchdog. Current rows in CRM: ${currentRows}/500`);

    while (currentRows < 500) {
        await new Promise(r => setTimeout(r, 60000)); // check every 60s
        try {
            const rows = await sheet.getRows();
            currentRows = rows.length;
            log(`[Watchdog Pulse] Current CRM rows: ${currentRows}/500 (${500 - currentRows} remaining)`);
        } catch (e) {
            log(`[Watchdog Pulse] Check error: ${e.message}`);
        }
    }

    log('\n🎉🎯 MILESTONE ACHIEVED: 500 TOTAL LEADS REACHED IN CRM!');
    log('Commencing offline download and deep asset inspection...');

    // 1. Download CRM
    const snapshot = await downloadCrmSnapshot();
    log(`Downloaded ${snapshot.count} leads to ${snapshot.csvPath}`);

    // 2. Run Audit
    const auditResults = await runFullAudit(snapshot.records);
    fs.writeFileSync(path.join(process.cwd(), 'data_exports', 'audit_results.json'), JSON.stringify(auditResults, null, 2), 'utf8');
    log('Completed deep audit inspection across all deployed websites and assets.');

    // 3. Mark completed flag
    fs.writeFileSync(path.join(process.cwd(), 'data_exports', 'AUDIT_COMPLETE.flag'), JSON.stringify({
        completedAt: new Date().toISOString(),
        totalLeads: snapshot.count,
        auditSummary: auditResults
    }, null, 2), 'utf8');

    log('===========================================================');
    log('🏁 POST-500 AUDIT READY. FLAG WRITTEN.');
    log('===========================================================');
}

monitorUntil500AndAudit().catch(err => {
    log(`Watchdog Error: ${err.message}`);
});
