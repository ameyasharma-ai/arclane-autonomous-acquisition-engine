import { chromium } from 'playwright';

async function verifyLive() {
    const browser = await chromium.launch();
    
    // 1440px
    const page1440 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    console.log('Navigating to live gymparadox @ 1440px...');
    await page1440.goto('https://www.arclanestudios.space/sites/gymparadox', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page1440.waitForTimeout(3000);
    await page1440.screenshot({ path: 'live_gymparadox_navbar_1440.png', clip: { x: 0, y: 0, width: 1440, height: 200 } });
    
    const galleryEl = await page1440.$('#gallery');
    if (galleryEl) {
        await galleryEl.screenshot({ path: 'live_gymparadox_gallery_1440.png' });
    }
    
    const heroEl = await page1440.$('section:first-of-type');
    if (heroEl) {
        await heroEl.screenshot({ path: 'live_gymparadox_hero_1440.png' });
    }
    await page1440.close();

    // 1024px
    const page1024 = await browser.newPage({ viewport: { width: 1024, height: 900 } });
    console.log('Navigating to live gymparadox @ 1024px...');
    await page1024.goto('https://www.arclanestudios.space/sites/gymparadox', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page1024.waitForTimeout(2000);
    await page1024.screenshot({ path: 'live_gymparadox_navbar_1024.png', clip: { x: 0, y: 0, width: 1024, height: 200 } });
    await page1024.close();

    await browser.close();
    console.log('Live verification screenshots captured successfully!');
}

verifyLive().catch(console.error);

