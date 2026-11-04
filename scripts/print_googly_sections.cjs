const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites', 'googly11', 'index.html');
const html = fs.readFileSync(file, 'utf8');

// Print Hero section
const sHero = html.match(/<section[\s\S]*?<\/section>/gi);
console.log('=== HERO SECTION ===');
console.log(sHero[0].slice(0, 1500));

console.log('\n=== MENU SECTION ===');
console.log(sHero[2].slice(0, 1500));
