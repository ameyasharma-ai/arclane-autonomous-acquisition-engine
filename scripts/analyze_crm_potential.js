import fs from 'fs';
import path from 'path';

const snapshotPath = path.join(process.cwd(), 'data', 'crm_exports', 'crm_snapshot_latest.json');
const leads = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

console.log('Total leads downloaded:', leads.length);

let withPhone = 0;
let withRating = 0;
let totalReviewsCount = 0;
let reviewsCountLogged = 0;
let withAgencyUrl = 0;
let highIntentPotential = 0; // rating >= 4.0, reviews >= 50
let ultraHighIntent = 0; // rating >= 4.2, reviews >= 200
let niches = {};
let localities = {};

for (const l of leads) {
  const phone = (l['Phone/WhatsApp'] || l['Phone'] || '').trim();
  if (phone) withPhone++;

  const rawRating = parseFloat(l['Ratings'] || l['Rating'] || 0);
  const rawReviews = parseInt(String(l['Number Of Reviews'] || l['Reviews'] || '0').replace(/\D/g, ''), 10) || 0;

  if (rawRating > 0) withRating++;
  if (rawReviews > 0) {
    totalReviewsCount += rawReviews;
    reviewsCountLogged++;
  }

  const agencyUrl = (l['Agency Hosted URL'] || '').trim();
  if (agencyUrl) withAgencyUrl++;

  if (rawRating >= 4.0 && rawReviews >= 50) highIntentPotential++;
  if (rawRating >= 4.2 && rawReviews >= 200) ultraHighIntent++;

  const niche = l['Industry/Niche'] || 'Unspecified';
  niches[niche] = (niches[niche] || 0) + 1;

  const addr = l['Address'] || '';
  for (const loc of ['Kankarbagh', 'Boring Road', 'Bailey Road', 'Fraser Road', 'Patliputra', 'Danapur', 'Rajendra Nagar']) {
    if (addr.toLowerCase().includes(loc.toLowerCase())) {
      localities[loc] = (localities[loc] || 0) + 1;
    }
  }
}

const analysis = {
  totalLeads: leads.length,
  withPhone,
  phonePercentage: ((withPhone / leads.length) * 100).toFixed(1) + '%',
  withAgencyUrl,
  highIntentPotential,
  highIntentPercentage: ((highIntentPotential / leads.length) * 100).toFixed(1) + '%',
  ultraHighIntent,
  avgReviewsPerReviewLoggedLead: Math.round(totalReviewsCount / (reviewsCountLogged || 1)),
  niches,
  localities
};

console.log(JSON.stringify(analysis, null, 2));

fs.writeFileSync('data/crm_exports/crm_potential_analysis.json', JSON.stringify(analysis, null, 2));

