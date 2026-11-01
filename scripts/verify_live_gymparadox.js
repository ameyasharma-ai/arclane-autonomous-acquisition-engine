import { chromium } from 'playwright';

async function verifyLiveGymParadox() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    
    console.log('[VERIFY] Navigating to https://www.arclanestudios.space/sites/gymparadox ...');
    await page.goto('https://www.arclanestudios.space/sites/gymparadox', { waitUntil: 'networkidle' });

    // Inspect image src attributes
    const imageInfo = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img')).map(img => ({
            alt: img.getAttribute('alt'),
            src: img.getAttribute('src'),
            currentSrc: img.currentSrc,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            hasFallenBack: img.hasAttribute('data-has-fallen-back')
        }));
        return imgs;
    });

    console.log('[VERIFY] Image Elements Found:');
    imageInfo.forEach((img, i) => {
        console.log(`  [${i}] alt: "${img.alt}"`);
        console.log(`       src: ${img.src}`);
        console.log(`       dimensions: ${img.naturalWidth}x${img.naturalHeight}, fallback: ${img.hasFallenBack}`);
    });

    // Capture screenshots of Hero and Facility Showcase
    const heroSection = await page.$('section');
    if (heroSection) {
        await heroSection.screenshot({ path: 'public/gymparadox_hero_live.jpg' });
        console.log('[VERIFY] Saved public/gymparadox_hero_live.jpg');
    }

    const gallerySection = await page.$('#gallery');
    if (gallerySection) {
        await gallerySection.screenshot({ path: 'public/gymparadox_gallery_live.jpg' });
        console.log('[VERIFY] Saved public/gymparadox_gallery_live.jpg');
    }

    await browser.close();
}

verifyLiveGymParadox().catch(console.error);

