const fs = require('fs');
const path = require('path');
const sitesDir = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites');
const sites = fs.readdirSync(sitesDir).filter(s => fs.statSync(path.join(sitesDir, s)).isDirectory());

let emptyPrefixCount = 0;
let emptyPrefixSites = [];

sites.forEach(s => {
  const indexFile = path.join(sitesDir, s, 'index.html');
  if (fs.existsSync(indexFile)) {
    const html = fs.readFileSync(indexFile, 'utf8');
    if (/\b(?:sm|md|lg|xl|2xl):\s+/g.test(html)) {
      emptyPrefixCount++;
      emptyPrefixSites.push(s);
    }
  }
});

console.log('Sites with empty responsive prefixes (sm: md: lg: etc):', emptyPrefixCount);
console.log('Sample affected:', emptyPrefixSites.slice(0, 10));
