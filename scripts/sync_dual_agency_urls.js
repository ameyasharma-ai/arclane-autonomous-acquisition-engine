import { loadGoogleSheet, highlightCell } from '../src/sheets.js';
import openpyxl from 'child_process';
import { execSync } from 'child_process';

const INTEREST_LEADS_MAP = {
  '2': { orig: 'https://populardineout.github.io/', slug: 'populardineout' },
  '4': { orig: 'https://heartbeat-hub-nine.vercel.app/', slug: 'crossfit' },
  '10': { orig: 'http://fitbeast.netlify.app/', slug: 'fitbeast' },
  '19': { orig: 'https://fitnessvilla-pro-gym--abhishek9262kum.replit.app/', slug: 'fitnessvilla' },
  '33': { orig: 'https://tushar0612.github.io/', slug: 'titanpro' },
  '37': { orig: 'https://knockoutfit.netlify.app/', slug: 'knockout' },
  '70': { orig: 'https://hardcore-gym.github.io/', slug: 'hardcoregym' },
  '75': { orig: 'https://lpd.yourdigitallift.in/', slug: 'musclesbox' },
  '120': { orig: 'https://form.svhrt.com/', slug: 'fitnessconnection' },
  '121': { orig: 'https://www.marxfitness.info/', slug: 'marxfit' },
  '130': { orig: 'http://gym.com/', slug: 'bloom' },
  '131': { orig: 'http://theprofitnessgym.com/', slug: 'profitness' }
};

async function syncRedAgencyUrls() {
  const { sheet, doc } = await loadGoogleSheet();
  const rows = await sheet.getRows();
  const agencyColIdx = sheet.headerValues.indexOf('Agency Hosted URL');
  const existColIdx = sheet.headerValues.indexOf('Existing Website');
  
  let count = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cid = String(row.get('Client ID') || '').trim();
    if (INTEREST_LEADS_MAP[cid]) {
      const info = INTEREST_LEADS_MAP[cid];
      const agencyUrl = `https://www.arclanestudios.space/sites/${info.slug}`;
      
      row.set('Agency Hosted URL', agencyUrl);
      if (existColIdx !== -1) {
        row.set('Existing Website', info.orig);
      }
      if (sheet.headerValues.includes('Website URL')) {
        row.set('Website URL', info.orig);
      }
      await row.save();
      
      // Highlight Existing Website in RED (or fallback to Agency Hosted URL if header not found)
      const targetColIdx = existColIdx !== -1 ? existColIdx : agencyColIdx;
      await highlightCell(sheet, doc, i + 1, targetColIdx);
      count++;
      console.log(`Synced & Red-Highlighted Lead #${cid} (${row.get('Business Name')}): Agency=[${agencyUrl}], Existing=[${info.orig}]`);
    }
  }
  console.log(`Finished updating ${count} leads in Google Sheets!`);
}

syncRedAgencyUrls().catch(err => console.error('Error:', err));

