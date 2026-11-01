import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const VERIFIED_POOLS = {
    gym: [
        'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=800&q=80'
    ],
    restaurant: [
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80'
    ],
    cafe_bakery: [
        'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=800&q=80'
    ],
    dental: [
        'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=800&q=80'
    ]
};

function getPool(dirName = '') {
    const s = dirName.toLowerCase();
    if (s.includes('dent') || s.includes('clinic') || s.includes('dr')) return VERIFIED_POOLS.dental;
    if (s.includes('cafe') || s.includes('bake') || s.includes('cake') || s.includes('waff')) return VERIFIED_POOLS.cafe_bakery;
    if (s.includes('gym') || s.includes('fit') || s.includes('dance') || s.includes('karate') || s.includes('martial') || s.includes('runner')) return VERIFIED_POOLS.gym;
    return VERIFIED_POOLS.restaurant;
}

const realBroken = JSON.parse(fs.readFileSync('data_exports/real_broken_images.json', 'utf8'));
const brokenSet = new Set(realBroken);

// Also extract base photo IDs from broken URLs
const brokenPhotoIds = new Set();
for (const u of brokenSet) {
    const m = u.match(/photo-[0-9a-zA-Z-]+/);
    if (m) brokenPhotoIds.add(m[0]);
}

console.log(`Loaded ${brokenSet.size} full broken URLs, corresponding to ${brokenPhotoIds.size} broken photo IDs.`);

function patchDirectory(baseDir) {
    const entries = fs.readdirSync(baseDir);
    let patched = 0;

    for (const ent of entries) {
        const indexPath = path.join(baseDir, ent, 'index.html');
        if (fs.existsSync(indexPath)) {
            let html = fs.readFileSync(indexPath, 'utf8');
            let modified = false;
            const pool = getPool(ent);

            // Replace template literals
            if (html.includes('${item.image}') || html.includes('${item.img}')) {
                html = html.replace(/\$\{item\.(image|img)\}/g, pool[0]);
                modified = true;
            }

            // Replace full broken URLs
            let poolIdx = 0;
            for (const bad of brokenSet) {
                if (html.includes(bad)) {
                    html = html.split(bad).join(pool[poolIdx % pool.length]);
                    poolIdx++;
                    modified = true;
                }
            }

            // Also check for any partial photo-ID match if query parameters differed
            for (const pid of brokenPhotoIds) {
                if (html.includes(pid)) {
                    const regex = new RegExp('https:\\/\\/images\\.unsplash\\.com\\/' + pid + '[^"\'>\\s]*', 'g');
                    html = html.replace(regex, pool[poolIdx % pool.length]);
                    poolIdx++;
                    modified = true;
                }
            }

            if (modified) {
                fs.writeFileSync(indexPath, html, 'utf8');
                patched++;
            }
        }
    }
    return patched;
}

console.log('\n--- Patching generated_sites ---');
const p1 = patchDirectory(path.join(process.cwd(), 'generated_sites'));
console.log(`Patched ${p1} directories in generated_sites.`);

console.log('\n--- Patching web-dev-agency/public/sites ---');
const p2 = patchDirectory(path.join(process.cwd(), 'web-dev-agency', 'public', 'sites'));
console.log(`Patched ${p2} directories in web-dev-agency.`);

// Git commit & push in web-dev-agency
console.log('\n--- Committing & Pushing web-dev-agency ---');
const repo = path.join(process.cwd(), 'web-dev-agency');
execSync('git add .', { cwd: repo });
const status = execSync('git status --porcelain', { cwd: repo }).toString();
if (status.trim() !== '') {
    execSync('git commit -m "Thorough fix: Replace all GET-confirmed broken image IDs with verified pools"', { cwd: repo });
    execSync('git push origin main', { cwd: repo });
    console.log('✅ Successfully pushed all fixes to GitHub origin main!');
} else {
    console.log('Working tree clean, nothing new to commit.');
}

