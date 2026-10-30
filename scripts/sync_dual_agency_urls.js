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
  
  let count = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cid = String(row.get('Client ID') || '').trim();
    if (INTEREST_LEADS_MAP[cid]) {
      const info = INTEREST_LEADS_MAP[cid];
      const agencyUrl = `https://www.arclanestudios.space/sites/${info.slug}`;
      const compositeVal = `${info.orig} | ${agencyUrl}`;
      
      row.set('Agency Hosted URL', compositeVal);
      row.set('Website URL', info.orig);
      await row.save();
      
      // Highlight in RED
      await highlightCell(sheet, doc, i + 1, agencyColIdx);
      count++;
      console.log(`Synced & Red-Highlighted Lead #${cid} (${row.get('Business Name')}): ${compositeVal}`);
    }
  }
  console.log(`Finished updating ${count} leads in Google Sheets!`);
}

syncRedAgencyUrls().catch(err => console.error('Error:', err));
