import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const agencySitesDir = path.join(process.cwd(), 'web-dev-agency', 'public', 'sites');
const audit = JSON.parse(fs.readFileSync('data_exports/broken_images_audit.json', 'utf8'));
const brokenUrls = new Set(audit.brokenUrls);

const REPLACEMENT_IMAGE = 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80';

console.log('Sweeping web-dev-agency/public/sites for any broken image references...');
const folders = fs.readdirSync(agencySitesDir);
let patched = 0;

for (const folder of folders) {
    const indexPath = path.join(agencySitesDir, folder, 'index.html');
    if (fs.existsSync(indexPath)) {
        let content = fs.readFileSync(indexPath, 'utf8');
        let modified = false;

        // Check for template literals
        if (content.includes('${item.image}') || content.includes('${item.img}')) {
            content = content.replace(/\$\{item\.(image|img)\}/g, REPLACEMENT_IMAGE);
            modified = true;
        }

        // Check for any broken URLs
        for (const bad of brokenUrls) {
            if (content.includes(bad)) {
                content = content.split(bad).join(REPLACEMENT_IMAGE);
                modified = true;
            }
        }

        if (modified) {
            fs.writeFileSync(indexPath, content, 'utf8');
            patched++;
            console.log(`Patched web-dev-agency folder: ${folder}`);
        }
    }
}

console.log(`\nPatched ${patched} directories in web-dev-agency directly.`);

// Git commit & push in web-dev-agency
console.log('Pushing changes to remote GitHub repo for web-dev-agency...');
execSync('git add .', { cwd: path.join(process.cwd(), 'web-dev-agency') });
execSync('git commit -m "Fix all broken image URLs and template literals across all public sites"', { cwd: path.join(process.cwd(), 'web-dev-agency') });
execSync('git push origin main', { cwd: path.join(process.cwd(), 'web-dev-agency') });
console.log('✅ Changes pushed live to GitHub!');

