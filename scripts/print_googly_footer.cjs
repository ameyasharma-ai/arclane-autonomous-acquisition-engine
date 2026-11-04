const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites', 'googly11', 'index.html');
const html = fs.readFileSync(file, 'utf8');

const sFooter = html.match(/<footer[\s\S]*?<\/footer>/i);
if (sFooter) {
  console.log(sFooter[0]);
} else {
  console.log('No footer match');
}
