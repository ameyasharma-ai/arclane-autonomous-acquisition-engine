import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function optimizeImages() {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    const targets = [
        'web-dev-agency/public/sites/gymparadox/assets/gallery-2.jpg',
        'generated_sites/5/assets/gallery-2.jpg'
    ];

    for (const target of targets) {
        if (!fs.existsSync(target)) continue;
        const buf = fs.readFileSync(target);
        console.log(`Original ${target} size: ${buf.length} bytes`);

        const jpegBase64 = await page.evaluate(async (base64) => {
            const img = new Image();
            img.src = 'data:image/png;base64,' + base64;
            await img.decode();
            const canvas = document.createElement('canvas');
            canvas.width = 1200;
            canvas.height = Math.round((1200 / img.naturalWidth) * img.naturalHeight);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
        }, buf.toString('base64'));

        const optimizedBuf = Buffer.from(jpegBase64, 'base64');
        fs.writeFileSync(target, optimizedBuf);
        console.log(`Optimized ${target} size: ${optimizedBuf.length} bytes`);
    }

    await browser.close();
    console.log('Image optimization complete!');
}

optimizeImages().catch(console.error);

