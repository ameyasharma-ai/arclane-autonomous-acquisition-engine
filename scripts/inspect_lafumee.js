import fs from 'fs';

const html = fs.readFileSync('web-dev-agency/public/sites/lafumee/index.html', 'utf8');
const imgs = html.match(/<img[^>]+>/g) || [];
console.log('Total img tags:', imgs.length);
imgs.forEach((img, i) => console.log((i + 1) + ': ' + img));
