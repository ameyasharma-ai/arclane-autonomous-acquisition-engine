/**
 * Sync and Arrange Leads after 500th in exact ranking fashion
 * 
 * Ranking methodology discovered from 1-500:
 * 1. Priority Tier: '1 - Red (High)' for high ratings & review counts / key targets.
 * 2. Within Tier Sub-grouping:
 *    - Leads with Existing Website (competitor / outdated site) ranked first, ordered descending by Google Review count.
 *    - Leads without Existing Website ranked next, ordered descending by Google Review count.
 * 
 * Target Leads:
 * - ID 504: The Lifeline Gym (679 reviews, 4.9★, Existing Website: YES) -> Rank #1 (Row 502)
 * - ID 502: SAMRAT FITNESS (642 reviews, 4.9★, Existing Website: YES) -> Rank #2 (Row 503)
 * - ID 503: FIT INDIA GYM (141 reviews, 4.8★, Existing Website: YES) -> Rank #3 (Row 504)
 * - ID 501: Bake n Bite bliss (100 reviews, 4.9★, Existing Website: NO) -> Rank #4 (Row 505)
 * - ID 505: i-Nex GYM [BIHTA] (88 reviews, 4.9★, Existing Website: NO) -> Rank #5 (Row 506)
 */
import { loadGoogleSheet } from '../src/sheets.js';
import fs from 'fs';
import path from 'path';

async function main() {
    console.log('🔄 Loading Google Sheet CRM...');
    const { sheet, doc } = await loadGoogleSheet();
    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();
    console.log(`📊 Total rows loaded: ${rows.length}`);

    // Read cached full dump to preserve all existing fields accurately
    const dumpPath = path.join(process.cwd(), 'reports', '.crm_state', 'full_sheet_dump.json');
    const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));

    // Extract leads 501-505
    const targetIds = ['501', '502', '503', '504', '505'];
    const targetDataMap = new Map();

    dump.forEach(r => {
        if (targetIds.includes(String(r['Client ID']).trim())) {
            targetDataMap.set(String(r['Client ID']).trim(), r);
        }
    });

    console.log(`Found ${targetDataMap.size} target leads in dump.`);

    // Prepare objects with Priority Level set to '1 - Red (High)'
    const targets = Array.from(targetDataMap.values()).map(r => ({
        ...r,
        'Priority Level': '1 - Red (High)'
    }));

    function parseReviews(val) {
        if (!val) return 0;
        const n = parseInt(String(val).replace(/[^0-9]/g, ''), 10);
        return isNaN(n) ? 0 : n;
    }

    // Sort according to ranking fashion:
    // 1. Existing Website presence first (1 vs 0)
    // 2. Number Of Reviews descending
    targets.sort((a, b) => {
        const aWeb = a['Existing Website'] && a['Existing Website'].trim() !== '' ? 1 : 0;
        const bWeb = b['Existing Website'] && b['Existing Website'].trim() !== '' ? 1 : 0;
        if (aWeb !== bWeb) return bWeb - aWeb;
        return parseReviews(b['Number Of Reviews']) - parseReviews(a['Number Of Reviews']);
    });

    console.log('\n--- TARGET ORDER AFTER 500TH ---');
    targets.forEach((r, idx) => {
        const rowNum = 502 + idx;
        console.log(`Row ${rowNum} | Client ID: ${r['Client ID']} | ${r['Business Name']} | Reviews: ${r['Number Of Reviews']} | Web: ${Boolean(r['Existing Website'])} | Priority: ${r['Priority Level']}`);
    });

    // We need to update Google Sheet rows at index 500..504 (which correspond to physical rows 502..506)
    // Let's verify we have rows 500 to 504 in the live sheet
    if (rows.length < 505) {
        throw new Error(`Expected at least 505 rows in Google Sheet, found ${rows.length}`);
    }

    const headers = sheet.headerValues;

    console.log('\n🚀 Updating live Google Sheet rows 502 to 506...');
    for (let i = 0; i < targets.length; i++) {
        const targetRow = rows[500 + i];
        const newLeadData = targets[i];

        console.log(`Updating Sheet Row ${502 + i} with Client ID ${newLeadData['Client ID']} (${newLeadData['Business Name']})...`);
        for (const header of headers) {
            const val = newLeadData[header] !== undefined && newLeadData[header] !== null ? String(newLeadData[header]) : '';
            targetRow.set(header, val);
        }
        await targetRow.save();
        console.log(`  ✅ Row ${502 + i} saved!`);
    }

    console.log('\n🎉 Successfully updated and arranged all leads after 500th in Google Sheets CRM!');

    // Update local data_exports/crm_leads_latest.json
    try {
        const latestExportPath = path.join(process.cwd(), 'data_exports', 'crm_leads_latest.json');
        if (fs.existsSync(latestExportPath)) {
            const latestData = JSON.parse(fs.readFileSync(latestExportPath, 'utf8'));
            // Replace or update 501..505 in latestData
            targets.forEach(t => {
                const idx = latestData.findIndex(r => String(r['Client ID']).trim() === String(t['Client ID']).trim());
                if (idx !== -1) {
                    latestData[idx] = { ...latestData[idx], ...t };
                } else {
                    latestData.push(t);
                }
            });
            fs.writeFileSync(latestExportPath, JSON.stringify(latestData, null, 2), 'utf8');
            console.log('✅ Updated data_exports/crm_leads_latest.json');
        }
    } catch (e) {
        console.warn('Warning updating crm_leads_latest.json:', e.message);
    }
}

main().catch(err => {
    console.error('❌ Error executing main:', err);
    process.exit(1);
});
