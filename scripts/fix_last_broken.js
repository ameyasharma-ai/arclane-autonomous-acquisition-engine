/**
 * Fix the last 2 broken Unsplash images across 4 site directories.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WDA_SITES = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites');

// Broken photo IDs → verified working replacements
const REPLACEMENTS = {
  // photo-1625398407796-83650f7c617e (404) → verified restaurant/food image
  '1625398407796-83650f7c617e': 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=400&q=80',
  // photo-1599487488170-d33192248553 (404) → verified restaurant interior
  '1599487488170-d33192248553': 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80',
};

const SITES = ['golden-flavour', 'goldenflavour', 'la-fumee', 'lafumee'];

for (const site of SITES) {
  const htmlFile = path.join(WDA_SITES, site, 'index.html');
  if (!fs.existsSync(htmlFile)) {
    console.log(`⚠️ ${site} directory not found, skipping`);
    continue;
  }
  
  let html = fs.readFileSync(htmlFile, 'utf8');
  let changed = false;
  
  for (const [brokenId, replacement] of Object.entries(REPLACEMENTS)) {
    const regex = new RegExp(
      `https://images\\.unsplash\\.com/photo-${brokenId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"'\\s)]*`,
      'g'
    );
    if (regex.test(html)) {
      html = html.replace(regex, replacement);
      changed = true;
      console.log(`✅ ${site}: replaced photo-${brokenId}`);
    }
  }
  
  if (changed) {
    fs.writeFileSync(htmlFile, html, 'utf8');
  }
}

console.log('\nDone! All broken images fixed.');

