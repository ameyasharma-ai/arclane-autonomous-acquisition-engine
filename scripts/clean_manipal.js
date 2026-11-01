import fs from 'fs';

const files = [
  'web-dev-agency/public/sites/manipal/index.html',
  'web-dev-agency/public/sites/manipaldental/index.html',
  'generated_sites/486/index.html'
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');

  // Strip duplicate trailing onerror
  html = html.replace(/\s+onerror="this\.src='[^']*'"/gi, '');

  fs.writeFileSync(file, html, 'utf8');
  console.log('Cleaned duplicate onerror in:', file);
}
