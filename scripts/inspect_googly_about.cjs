const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites', 'googly11', 'index.html');
const html = fs.readFileSync(file, 'utf8');

const sAbout = html.match(/<section id="about"[\s\S]*?<\/section>/i);
if (sAbout) {
  console.log(sAbout[0].slice(0, 1500));
} else {
  console.log('No section#about found');
}
