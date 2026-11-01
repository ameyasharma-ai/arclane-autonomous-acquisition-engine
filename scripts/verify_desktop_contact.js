import { chromium } from 'playwright';

async function verifyContact() {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await page.goto('https://www.arclanestudios.space/sites/crossfit', { waitUntil: 'networkidle' });
    
    const contactSection = page.locator('#contact').first();
    await contactSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2000);
    await contactSection.screenshot({ path: 'public/verified_contact_desktop.png' });
    console.log('Saved desktop contact section screenshot');

    await browser.close();
}

verifyContact().catch(console.error);

