import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function inspectLocal() {
    const browser = await chromium.launch();
    
    // Test viewport at 1440, 1200, 1024, and 768
    const viewports = [1440, 1200, 1024, 768];

    for (const w of viewports) {
        const page = await browser.newPage({ viewport: { width: w, height: 900 } });
        
        // Gym Paradox
        const gymPath = 'file:///' + path.resolve(__dirname, '../web-dev-agency/public/sites/gymparadox/index.html').replace(/\\/g, '/');
        await page.goto(gymPath, { waitUntil: 'domcontentloaded' });
        await page.screenshot({ path: `test_gym_header_${w}.png`, clip: { x: 0, y: 0, width: w, height: 180 } });

        // Crossfit
        const cfPath = 'file:///' + path.resolve(__dirname, '../web-dev-agency/public/sites/crossfit/index.html').replace(/\\/g, '/');
        await page.goto(cfPath, { waitUntil: 'domcontentloaded' });
        const contact = await page.$('#contact');
        if (contact) {
            await contact.screenshot({ path: `test_cf_contact_${w}.png` });
        }
        await page.close();
    }

    await browser.close();
    console.log('Local visual inspection complete across viewports!');
}

inspectLocal().catch(console.error);

