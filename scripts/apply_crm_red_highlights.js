import { loadGoogleSheet, highlightCell } from '../src/sheets.js';
import fs from 'fs';

// Known interest client IDs where an original potential/experimental website was targeted
const INTEREST_CLIENT_IDS = [
  '2', '4', '5', '10', '19', '33', '37', '70', '75', '120', '121', '130', '131',
  '530', '533', '551', '559', '567', '568', '592', '597', '599', '602', '605'
];

async function highlightCrm() {
  const { sheet, doc } = await loadGoogleSheet();
  const rows = await sheet.getRows();
  const targetColIdx = sheet.headerValues.indexOf('Existing Website') !== -1
    ? sheet.headerValues.indexOf('Existing Website')
    : sheet.headerValues.indexOf('Agency Hosted URL');

  if (targetColIdx === -1) {
    console.log('Target column not found in Google Sheet');
    return;
  }
  
  let count = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cid = String(row.get('Client ID') || '').trim();
    const notes = (row.get('Notes') || '').toLowerCase();
    
    if (INTEREST_CLIENT_IDS.includes(cid) || notes.includes('website_of_interest')) {
      // Row index in Google Sheets API is i + 1 (row 0 is header)
      await highlightCell(sheet, doc, i + 1, targetColIdx);
      count++;
      console.log(`Highlighted row ${i + 2} (Client #${cid}): ${row.get('Business Name')}`);
    }
  }
  console.log(`Total highlighted cells in Google Sheets CRM: ${count}`);
}

highlightCrm().catch(err => console.error('Error:', err));
