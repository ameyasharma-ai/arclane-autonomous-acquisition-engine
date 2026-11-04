const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites', 'googly11', 'index.html');
const html = fs.readFileSync(file, 'utf8');

// Check for literal > in text or between tags
const lines = html.split('\n');
console.log('Lines with potential stray > or tag issues in googly11:');
lines.forEach((l, i) => {
  if (l.includes('</div>>') || l.includes('>>') || l.includes('>&gt;') || l.includes('">>') || l.match(/<[^>]*>[^<]*>[^<]*</)) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});
