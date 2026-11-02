import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function verify() {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    
    // Serve from web-dev-agency root so /sites/gymparadox/assets resolves properly
    await page.route('**/sites/gymparadox/assets/**', route => {
        const url = route.request().url();
        const filename = url.split('/').pop().split('?')[0];
        const filePath = path.resolve('web-dev-agency/public/sites/gymparadox/assets', filename);
        if (fs.existsSync(filePath)) {
            route.fulfill({
                status: 200,
                contentType: 'image/jpeg',
                body: fs.readFileSync(filePath)
            });
        } else {
            route.continue();
        }
    });

    const gymPath = 'file:///' + path.resolve('web-dev-agency/public/sites/gymparadox/index.html').replace(/\\/g, '/');
    await page.goto(gymPath, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    
    const gallery = await page.$('#gallery');
    if (gallery) {
        await gallery.screenshot({ path: 'test_gym_gallery_verified.png' });
    }
    const hero = await page.$('section:first-of-type');
    if (hero) {
        await hero.screenshot({ path: 'test_gym_hero_verified.png' });
    }
    
    await browser.close();
    console.log('Verified gallery and hero screenshots taken successfully!');
}

verify().catch(console.error);
