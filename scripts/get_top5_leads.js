import { loadGoogleSheet } from '../src/sheets.js';

async function main() {
  const { sheet } = await loadGoogleSheet();
  const rows = await sheet.getRows();
  console.log('Top 5 leads in LIVE Google Sheet CRM:');
  for (let i = 0; i < 5; i++) {
    const row = rows[i];
    console.log(JSON.stringify({
      rowNumber: i + 2,
      clientId: row.get('Client ID'),
      businessName: row.get('Business Name'),
      niche: row.get('Industry/Niche'),
      city: row.get('City/State'),
      agencyHostedUrl: row.get('Agency Hosted URL'),
      existingWebsite: row.get('Existing Website'),
      status: row.get('Current Status'),
      mapsUrl: row.get('Socials') || row.get('Address')
    }, null, 2));
  }
}
main();

