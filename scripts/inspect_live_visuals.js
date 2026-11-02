import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  console.log('Loading gymparadox...');
  await page.goto('https://www.arclanestudios.space/sites/gymparadox', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test_gymparadox_navbar.png', clip: { x: 0, y: 0, width: 1440, height: 250 } });
  
  const gallery = await page.$('#gallery');
  if (gallery) {
    await gallery.screenshot({ path: 'test_gymparadox_gallery.png' });
  }

  console.log('Loading crossfit...');
  await page.goto('https://www.arclanestudios.space/sites/crossfit', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);
  const contactEl = await page.$('#contact');
  if (contactEl) {
    await contactEl.screenshot({ path: 'test_crossfit_contact.png' });
  }

  await browser.close();
  console.log('Done capturing screenshots!');
}

run().catch(console.error);
