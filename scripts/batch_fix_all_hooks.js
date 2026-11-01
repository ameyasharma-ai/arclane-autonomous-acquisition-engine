/**
 * High-performance batch update of all AI Outreach Hook URLs in Google Sheets CRM
 * Uses a single batch request via sheet.loadCells() and sheet.saveUpdatedCells().
 */
import fs from 'fs';
import path from 'path';
import { loadGoogleSheet } from '../src/sheets.js';

async function batchFixHooks() {
    console.log('[BatchFix] Connecting to Google Sheets CRM...');
    const { sheet } = await loadGoogleSheet();
    await sheet.loadHeaderRow();

    const hookColIdx = sheet.headerValues.indexOf('AI Outreach Hook');
    const agencyColIdx = sheet.headerValues.indexOf('Agency Hosted URL');
    const idColIdx = sheet.headerValues.indexOf('Client ID');
    const nameColIdx = sheet.headerValues.indexOf('Business Name');

    console.log(`Indices -> ID: ${idColIdx}, Name: ${nameColIdx}, AgencyURL: ${agencyColIdx}, Hook: ${hookColIdx}`);
    if (hookColIdx === -1 || agencyColIdx === -1) {
        throw new Error('Required columns not found in header row!');
    }

    const totalRows = sheet.rowCount;
    console.log(`[BatchFix] Total rows in sheet: ${totalRows}. Loading cells...`);

    // Load up to row 505
    await sheet.loadCells({
        startRowIndex: 1,
        endRowIndex: Math.min(totalRows, 505),
        startColumnIndex: 0,
        endColumnIndex: Math.max(hookColIdx, agencyColIdx) + 1
    });

    let updatedCount = 0;
    const reportsDir = path.join(process.cwd(), 'reports');

    for (let r = 1; r <= 500; r++) {
        const idCell = sheet.getCell(r, idColIdx);
        const nameCell = sheet.getCell(r, nameColIdx);
        const agencyCell = sheet.getCell(r, agencyColIdx);
        const hookCell = sheet.getCell(r, hookColIdx);

        const clientId = idCell.value;
        if (!clientId) continue;

        const agencyUrl = String(agencyCell.value || '').trim();
        const currentHook = String(hookCell.value || '');

        if (!agencyUrl || !agencyUrl.startsWith('http')) continue;

        // Check if hook has a URL that is not agencyUrl
        const match = currentHook.match(/https?:\/\/[^\s]+/);
        if (match && match[0] !== agencyUrl) {
            const correctedHook = currentHook.replace(match[0], agencyUrl);
            hookCell.value = correctedHook;
            updatedCount++;

            if (updatedCount <= 5) {
                console.log(`  [Fix #${updatedCount}] Row ${r+1} (Client #${clientId} - ${nameCell.value}):`);
                console.log(`    ❌ Was: ${match[0]}`);
                console.log(`    ✅ Now: ${agencyUrl}`);
            }

            // Sync local reports/<clientId> files
            const clientReportsDir = path.join(reportsDir, String(clientId));
            const outreachJsonPath = path.join(clientReportsDir, 'outreach.json');
            const outreachTxtPath = path.join(clientReportsDir, 'outreach.txt');

            if (fs.existsSync(outreachJsonPath)) {
                try {
                    const json = JSON.parse(fs.readFileSync(outreachJsonPath, 'utf8'));
                    json.whatsappMessage = correctedHook;
                    json.deployedUrl = agencyUrl;
                    json.agencyHostedUrl = agencyUrl;
                    fs.writeFileSync(outreachJsonPath, JSON.stringify(json, null, 2), 'utf8');
                } catch (e) {}
            }
            if (fs.existsSync(outreachTxtPath)) {
                try {
                    let txt = fs.readFileSync(outreachTxtPath, 'utf8');
                    txt = txt.replace(new RegExp(match[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), agencyUrl);
                    fs.writeFileSync(outreachTxtPath, txt, 'utf8');
                } catch (e) {}
            }
        }
    }

    console.log(`\n[BatchFix] Modified ${updatedCount} cells in memory. Sending single batch update to Google Sheets...`);
    await sheet.saveUpdatedCells();
    console.log(`[BatchFix] 🎉 Successfully saved all ${updatedCount} cells to Google Sheets CRM!`);

    return updatedCount;
}

batchFixHooks().catch(console.error);
