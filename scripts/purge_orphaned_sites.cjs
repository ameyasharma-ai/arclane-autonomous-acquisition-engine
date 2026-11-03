const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const reportsDir = path.join(__dirname, '..', 'reports');
const sitesDir = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites');

const reportFiles = fs.readdirSync(reportsDir).filter(f => !isNaN(f));
const crmSlugs = new Set();
for (const id of reportFiles) {
  const outreachPath = path.join(reportsDir, id, 'outreach.json');
  if (fs.existsSync(outreachPath)) {
    const o = JSON.parse(fs.readFileSync(outreachPath, 'utf8'));
    crmSlugs.add(o.slug);
  }
}

const allDirs = fs.readdirSync(sitesDir).filter(d => d !== '.gitkeep');
const orphaned = allDirs.filter(d => !crmSlugs.has(d));

console.log(`Found ${orphaned.length} orphaned directories in web-dev-agency/public/sites.`);
let count = 0;
for (const d of orphaned) {
  const relPath = `public/sites/${d}`;
  try {
    execSync(`git -C web-dev-agency rm -rf "${relPath}"`, { stdio: 'ignore' });
    count++;
  } catch (err) {
    // If untracked, remove manually
    fs.rmSync(path.join(sitesDir, d), { recursive: true, force: true });
    count++;
  }
}

console.log(`Successfully purged ${count} orphaned directories.`);
const remaining = fs.readdirSync(sitesDir).filter(d => d !== '.gitkeep');
console.log(`Remaining directories in web-dev-agency/public/sites: ${remaining.length} (Expected: 501)`);
