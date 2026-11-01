import fs from 'fs';
import path from 'path';

async function scanAndValidateAllImages() {
    console.log('Scanning all generated sites for external image URLs...');
    const siteDirs = fs.readdirSync('generated_sites').filter(f => !isNaN(f));
    const allUrls = new Set();
    const siteMap = {};

    siteDirs.forEach(id => {
        const p = path.join('generated_sites', id, 'index.html');
        if (fs.existsSync(p)) {
            const html = fs.readFileSync(p, 'utf8');
            const regex = /<img[^>]+src=["']([^"']+)["']/gi;
            let match;
            const images = [];
            while ((match = regex.exec(html)) !== null) {
                const src = match[1];
                images.push(src);
                if (src.startsWith('http')) {
                    allUrls.add(src);
                }
            }
            siteMap[id] = images;
        }
    });

    console.log(`Extracted ${allUrls.size} unique URLs across ${siteDirs.length} sites.`);

    // Check HEAD status of all unique URLs with concurrency
    const urlArray = [...allUrls];
    const brokenUrls = new Set();
    const workingUrls = new Set();

    const chunkSize = 25;
    for (let i = 0; i < urlArray.length; i += chunkSize) {
        const chunk = urlArray.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (url) => {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 6000);
                const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
                clearTimeout(timeout);
                if (res.status >= 400) {
                    brokenUrls.add(url);
                } else {
                    workingUrls.add(url);
                }
            } catch (err) {
                brokenUrls.add(url);
            }
        }));
        process.stdout.write(`Checked ${Math.min(i + chunkSize, urlArray.length)}/${urlArray.length} URLs...\r`);
    }

    console.log(`\n\nFound ${brokenUrls.size} broken image URLs across unique set.`);

    // Find all affected sites
    const affectedSites = {};
    for (const [id, imgs] of Object.entries(siteMap)) {
        const bad = imgs.filter(img => brokenUrls.has(img) || img.includes('${'));
        if (bad.length > 0) {
            affectedSites[id] = bad;
        }
    }

    console.log(`Total sites with broken images: ${Object.keys(affectedSites).length}`);
    fs.writeFileSync('data_exports/broken_images_audit.json', JSON.stringify({
        totalUniqueUrls: urlArray.length,
        brokenUrlsCount: brokenUrls.size,
        brokenUrls: [...brokenUrls],
        affectedSites
    }, null, 2), 'utf8');

    return { brokenUrls: [...brokenUrls], affectedSites };
}

scanAndValidateAllImages().catch(console.error);
