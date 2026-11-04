const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites', 'googly11', 'index.html');
const html = fs.readFileSync(file, 'utf8');

const scriptMatch = html.match(/<script[\s\S]*?<\/script>/gi);
console.log('Scripts in googly11:');
scriptMatch.forEach((s, idx) => {
  console.log(`\n--- SCRIPT ${idx + 1} ---`);
  console.log(s);
});
