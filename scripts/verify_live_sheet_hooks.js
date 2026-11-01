import { loadGoogleSheet } from '../src/sheets.js';

async function check() {
  const { sheet } = await loadGoogleSheet();
  const rows = await sheet.getRows();

  let mismatches = 0;
  for (let i = 0; i < Math.min(rows.length, 500); i++) {
    const row = rows[i];
    const agencyUrl = (row.get('Agency Hosted URL') || '').trim();
    const hook = (row.get('AI Outreach Hook') || '').trim();
    
    // Check if hook has a URL and if it contains agencyUrl
    const match = hook.match(/https?:\/\/[^\s"'<>\)]+/i);
    const hookUrl = match ? match[0] : '';
    
    if (agencyUrl && hookUrl && !hookUrl.includes(agencyUrl.replace('https://', '')) && !agencyUrl.includes(hookUrl.replace('https://', ''))) {
      mismatches++;
      if (mismatches <= 5) {
        console.log(`Mismatch on row ${i+2} (${row.get('Business Name')}): Agency=${agencyUrl} vs Hook=${hookUrl}`);
      }
    }
  }

  console.log(`\nVerification result: ${mismatches} mismatches found across the top 500 rows.`);
}

check();
