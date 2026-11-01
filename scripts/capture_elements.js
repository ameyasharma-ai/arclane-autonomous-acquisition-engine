import { chromium } from 'playwright';

async function capture() {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
    await page.goto('https://www.arclanestudios.space/sites/crossfit', { waitUntil: 'networkidle' });
    
    // Screenshot Showcase Card
    const card = await page.locator('.rounded-3xl.p-3').first();
    await card.screenshot({ path: 'public/verified_showcase_card_live.png' });
    console.log('Saved showcase card screenshot');

    // Screenshot Stats Bar
    const stats = await page.locator('.grid-cols-3').first();
    await stats.screenshot({ path: 'public/verified_stats_bar_live.png' });
    console.log('Saved stats bar screenshot');

    // Screenshot Map Card
    const map = page.locator('iframe[src*="maps"]').first();
    await map.scrollIntoViewIfNeeded();
    await page.waitForTimeout(3000);
    const parent = page.locator('div:has(> iframe[src*="maps"])').first();
    await parent.screenshot({ path: 'public/verified_map_card_live.png' });
    console.log('Saved map card screenshot');

    await browser.close();
}

capture().catch(console.error);
