/**
 * Fix all outreach messages in Google Sheets CRM so that EVERY row features
 * its pure, working Agency Hosted URL (https://www.arclanestudios.space/sites/<slug>).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadGoogleSheet } from '../src/sheets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fixAllSheetHooks(applyLive = false) {
    console.log(`[FixHooks] Connecting to Google Sheets CRM (applyLive: ${applyLive})...`);
    const { sheet } = await loadGoogleSheet();
    const rows = await sheet.getRows();
    console.log(`[FixHooks] Fetched ${rows.length} rows from Google Sheet.`);

    let fixedCount = 0;
    const updates = [];

    for (const row of rows) {
        const id = row.get('Client ID');
        const name = row.get('Business Name');
        const hook = row.get('AI Outreach Hook') || '';
        const agencyUrl = (row.get('Agency Hosted URL') || '').trim();

        if (!agencyUrl || !agencyUrl.startsWith('http')) continue;

        // Check for any URL in the hook
        const urlMatch = hook.match(/https?:\/\/[^\s]+/);
        if (urlMatch && urlMatch[0] !== agencyUrl) {
            fixedCount++;
            const correctedHook = hook.replace(urlMatch[0], agencyUrl);
            updates.push({
                row,
                id,
                name,
                oldUrl: urlMatch[0],
                newUrl: agencyUrl,
                correctedHook
            });
        }
    }

    console.log(`[FixHooks] Identified ${fixedCount} rows where AI Outreach Hook has wrong/stale URL.`);
    console.log('\nSample Fixes (First 5):');
    updates.slice(0, 5).forEach(u => {
        console.log(`  Lead #${u.id} (${u.name}):`);
        console.log(`    ❌ From: ${u.oldUrl}`);
        console.log(`    ✅ To:   ${u.newUrl}`);
    });

    if (applyLive) {
        console.log(`\n[FixHooks] 🚀 Applying fixes directly to live Google Sheets...`);
        let applied = 0;
        for (const u of updates) {
            u.row.set('AI Outreach Hook', u.correctedHook);
            applied++;
            if (applied % 20 === 0) {
                console.log(`  ... updated ${applied}/${updates.length} rows`);
            }
        }
        await sheet.saveUpdatedCells();
        console.log(`[FixHooks] 🎉 Successfully updated and saved all ${applied} rows in Google Sheets CRM!`);

        // Also update local reports/<clientId>/outreach.json & outreach.txt
        const reportsDir = path.join(process.cwd(), 'reports');
        for (const u of updates) {
            const clientReportsDir = path.join(reportsDir, String(u.id));
            const outreachJsonPath = path.join(clientReportsDir, 'outreach.json');
            const outreachTxtPath = path.join(clientReportsDir, 'outreach.txt');

            if (fs.existsSync(outreachJsonPath)) {
                try {
                    const json = JSON.parse(fs.readFileSync(outreachJsonPath, 'utf8'));
                    json.whatsappMessage = u.correctedHook;
                    json.deployedUrl = u.newUrl;
                    json.agencyHostedUrl = u.newUrl;
                    fs.writeFileSync(outreachJsonPath, JSON.stringify(json, null, 2), 'utf8');
                } catch (e) {}
            }
            if (fs.existsSync(outreachTxtPath)) {
                try {
                    let txt = fs.readFileSync(outreachTxtPath, 'utf8');
                    txt = txt.replace(new RegExp(u.oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), u.newUrl);
                    fs.writeFileSync(outreachTxtPath, txt, 'utf8');
                } catch (e) {}
            }
        }
        console.log(`[FixHooks] 📁 Synchronized local reports for all ${updates.length} leads.`);
    }

    return { fixedCount, updates };
}

const isApply = process.argv.includes('--apply');
fixAllSheetHooks(isApply).catch(console.error);

export { fixAllSheetHooks };

