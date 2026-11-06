const fs = require('fs');
const path = require('path');
const sitesDir = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites');
const sites = fs.readdirSync(sitesDir).filter(s => fs.statSync(path.join(sitesDir, s)).isDirectory());

let correctPaddingCount = 0;

sites.forEach(s => {
  const f = path.join(sitesDir, s, 'index.html');
  if (fs.existsSync(f)) {
    const html = fs.readFileSync(f, 'utf8');
    const footerMatch = html.match(/<footer\b[^>]*class=["']([^"']*)["']/i);
    if (footerMatch && footerMatch[1].includes('pb-28') && footerMatch[1].includes('md:pb-16')) {
      correctPaddingCount++;
    }
  }
});

console.log('Sites with pb-28 md:pb-16 footer padding:', correctPaddingCount);

