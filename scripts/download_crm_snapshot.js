import fs from 'fs';
import path from 'path';
import { loadGoogleSheet } from '../src/sheets.js';
import openpyxl from 'child_process';
import { spawn } from 'child_process';

async function downloadAndSaveSheet() {
  console.log('[Downloader] Connecting to Google Sheets API...');
  const { sheet, doc } = await loadGoogleSheet();
  const rows = await sheet.getRows();
  console.log(`[Downloader] Successfully fetched ${rows.length} rows from Google Sheets.`);

  const headers = sheet.headerValues;
  const data = [];
  
  for (const row of rows) {
    const obj = {};
    for (const h of headers) {
      obj[h] = row.get(h) || '';
    }
    data.push(obj);
  }

  // 1. Save as JSON snapshot
  const exportDir = path.join(process.cwd(), 'data', 'crm_exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(exportDir, `crm_snapshot_${timestamp}.json`);
  const latestJsonPath = path.join(exportDir, `crm_snapshot_latest.json`);
  
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
  fs.writeFileSync(latestJsonPath, JSON.stringify(data, null, 2), 'utf8');

  // 2. Save as CSV
  const csvRows = [];
  csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));
  for (const row of data) {
    const r = headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(',');
    csvRows.push(r);
  }
  const csvPath = path.join(exportDir, `crm_snapshot_latest.csv`);
  fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf8');

  console.log(`[Downloader] Saved latest JSON snapshot: ${latestJsonPath}`);
  console.log(`[Downloader] Saved latest CSV snapshot: ${csvPath}`);
}

downloadAndSaveSheet().catch(err => {
  console.error('[Downloader Error]', err);
});

