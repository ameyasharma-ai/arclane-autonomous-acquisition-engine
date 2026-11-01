import fs from 'fs';
import path from 'path';

async function scanWithGet() {
    console.log('Gathering all image URLs from web-dev-agency/public/sites...');
    const base = path.join(process.cwd(), 'web-dev-agency', 'public', 'sites');
    const folders = fs.readdirSync(base);
    const urls = new Set();
    const map = {};

    for (const f of folders) {
        const p = path.join(base, f, 'index.html');
        if (fs.existsSync(p)) {
            const html = fs.readFileSync(p, 'utf8');
            const matches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
            map[f] = matches;
            matches.forEach(u => {
                if (u.startsWith('http')) urls.add(u);
            });
        }
    }

    console.log(`Found ${urls.size} unique HTTP URLs across ${folders.length} sites in web-dev-agency.`);

    const urlList = [...urls];
    const broken = new Set();
    const batchSize = 20;

    for (let i = 0; i < urlList.length; i += batchSize) {
        const batch = urlList.slice(i, i + batchSize);
        await Promise.all(batch.map(async (u) => {
            try {
                const ctrl = new AbortController();
                const to = setTimeout(() => ctrl.abort(), 6000);
                const r = await fetch(u, { method: 'GET', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
                clearTimeout(to);
                if (r.status >= 400) {
                    broken.add(u);
                }
            } catch(e) {
                broken.add(u);
            }
        }));
        process.stdout.write(`Verified ${Math.min(i + batchSize, urlList.length)}/${urlList.length} URLs...\r`);
    }

    console.log(`\n\nVerified complete. Broken URLs detected via GET: ${broken.size}`);
    fs.writeFileSync('data_exports/real_broken_images.json', JSON.stringify([...broken], null, 2), 'utf8');
}

scanWithGet().catch(console.error);

