const fs = require('fs');
const path = require('path');
const sitesDir = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites');
const dirs = fs.readdirSync(sitesDir).filter(d => fs.existsSync(path.join(sitesDir, d, 'index.html')));

const strayTags = [];
const missingCurrentYear = [];

for (const d of dirs) {
  const p = path.join(sitesDir, d, 'index.html');
  const html = fs.readFileSync(p, 'utf8');

  // Check 1: stray > after tags
  const stray = html.match(/<\/[a-zA-Z0-9]+>>+|>[a-zA-Z0-9_-]+">>|class="[^"]*">>+/g);
  if (stray) {
    strayTags.push({ d, count: stray.length, sample: stray });
  }

  // Check 2: script tries to set document.getElementById('current-year') but element doesn't exist!
  if (html.includes("getElementById('current-year')") || html.includes('getElementById("current-year")')) {
    if (!html.includes('id="current-year"') && !html.includes("id='current-year'")) {
      missingCurrentYear.push(d);
    }
  }
}

console.log('Sites with stray > after tags:', strayTags.length);
if (strayTags.length > 0) console.log(strayTags.slice(0, 10));

console.log('Sites missing id="current-year" causing script TypeError:', missingCurrentYear.length);
if (missingCurrentYear.length > 0) console.log('Sample:', missingCurrentYear.slice(0, 10));
