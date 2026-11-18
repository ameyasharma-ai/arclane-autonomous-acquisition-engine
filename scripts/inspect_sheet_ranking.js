import { loadGoogleSheet } from '../src/sheets.js';
import fs from 'fs';

async function inspectSheet() {
    const { sheet } = await loadGoogleSheet();
    console.log('Sheet Title:', sheet.title);
    const rows = await sheet.getRows();
    console.log('Total Rows in Sheet:', rows.length);
    console.log('Headers:', sheet.headerValues);

    const allData = rows.map((r, idx) => ({
        rowIndex: idx + 2,
        ...r.toObject()
    }));

    fs.writeFileSync('reports/.crm_state/full_sheet_dump.json', JSON.stringify(allData, null, 2), 'utf-8');
    console.log('Dumped full sheet to reports/.crm_state/full_sheet_dump.json');

    console.log('\n--- Rows 495 to End ---');
    for (let i = Math.max(0, rows.length - 15); i < rows.length; i++) {
        const d = rows[i].toObject();
        console.log(`Row ${i + 2} [ID: ${d['Client ID']}]: Name="${d['Business Name']}", Rating="${d['Rating']}", Reviews="${d['Total Reviews'] || d['Reviews'] || ''}", Status="${d['Current Status']}", ExistingWeb="${d['Existing Website'] || d['Website URL'] || ''}", AgencyHosted="${d['Agency Hosted URL'] || ''}"`);
    }
}

inspectSheet().catch(console.error);
