const fs = require('fs');
const path = require('path');
const sitesDir = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites');
const sites = fs.readdirSync(sitesDir).filter(s => fs.statSync(path.join(sitesDir, s)).isDirectory());

const results = {};
const samples = {};

sites.forEach(s => {
  const indexFile = path.join(sitesDir, s, 'index.html');
  if (fs.existsSync(indexFile)) {
    const html = fs.readFileSync(indexFile, 'utf8');
    // Pattern: <tagName class="..."text</tagName
    const regex = /<([a-zA-Z0-9-]+)([^>]*"[^>]*)<\/\1(?![a-zA-Z0-9_>-])/gi;
    let m;
    while ((m = regex.exec(html)) !== null) {
      const tag = m[1].toLowerCase();
      results[tag] = (results[tag] || 0) + 1;
      if (!samples[tag]) {
        samples[tag] = { site: s, match: m[0] };
      }
    }
  }
});

console.log('Broken tag counts by tag type across all 501 sites:', results);
console.log('Samples:', JSON.stringify(samples, null, 2));
