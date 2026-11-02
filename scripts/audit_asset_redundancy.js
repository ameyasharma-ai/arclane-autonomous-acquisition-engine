import fs from 'fs';

['web-dev-agency/public/sites/gymparadox', 'web-dev-agency/public/sites/crossfit'].forEach(dir => {
    if (!fs.existsSync(dir)) return;
    const html = fs.readFileSync(dir + '/index.html', 'utf8');
    const regex = /<img\b[^>]*?\bsrc=["']([^"']+)["']/gi;
    const imgs = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        imgs.push(match[1]);
    }
    console.log('Site:', dir);
    console.log('  Total img tags:', imgs.length);
    console.log('  Unique srcs:', new Set(imgs).size);
    const counts = {};
    imgs.forEach(s => counts[s] = (counts[s] || 0) + 1);
    Object.entries(counts).filter(([_, c]) => c > 1).forEach(([s, c]) => {
        console.log(`  ⚠️ Duplicate: "${s}" appears ${c} times`);
    });
    // Check files on disk vs used
    const assetsDir = dir + '/assets';
    if (fs.existsSync(assetsDir)) {
        const files = fs.readdirSync(assetsDir);
        files.forEach(f => {
            if (f === 'photos_manifest.json') return;
            const isUsed = imgs.some(src => src.includes(f));
            if (!isUsed) console.log('  🗑️ Unreferenced/Orphaned file on disk:', f);
        });
    }
});
