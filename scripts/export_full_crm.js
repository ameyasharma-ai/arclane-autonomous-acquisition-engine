import fs from 'fs';
import path from 'path';
import { loadGoogleSheet } from '../src/sheets.js';

async function downloadCrmSnapshot() {
    console.log('[Snapshot] Connecting to Google Sheets CRM...');
    const { sheet, doc } = await loadGoogleSheet();
    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();
    console.log(`[Snapshot] Successfully fetched ${rows.length} rows.`);

    const headers = sheet.headerValues;
    const records = [];

    // Build CSV content
    const csvRows = [];
    csvRows.push(headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','));

    for (const row of rows) {
        const item = {};
        const rowVals = [];
        for (const h of headers) {
            const val = row.get(h) ?? '';
            item[h] = val;
            rowVals.push(`"${String(val).replace(/"/g, '""')}"`);
        }
        records.push(item);
        csvRows.push(rowVals.join(','));
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = path.join(process.cwd(), 'data_exports');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const csvPath = path.join(outDir, `crm_leads_500_${timestamp}.csv`);
    const jsonPath = path.join(outDir, `crm_leads_500_${timestamp}.json`);
    const latestCsv = path.join(outDir, `crm_leads_latest.csv`);
    const latestJson = path.join(outDir, `crm_leads_latest.json`);

    fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf8');
    fs.writeFileSync(latestCsv, csvRows.join('\n'), 'utf8');
    fs.writeFileSync(jsonPath, JSON.stringify(records, null, 2), 'utf8');
    fs.writeFileSync(latestJson, JSON.stringify(records, null, 2), 'utf8');

    console.log(`[Snapshot] Saved CSV to: ${csvPath}`);
    console.log(`[Snapshot] Saved JSON to: ${jsonPath}`);
    return { records, count: records.length, jsonPath, csvPath };
}

if (process.argv[1]?.endsWith('export_full_crm.js')) {
    downloadCrmSnapshot().catch(console.error);
}

export { downloadCrmSnapshot };
