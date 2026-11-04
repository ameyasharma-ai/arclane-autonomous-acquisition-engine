const { chromium } = require('playwright');
const path = require('path');

async function testGooglyInteractivity() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const file = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites', 'googly11', 'index.html');
  const url = 'file:///' + file.replace(/\\/g, '/');

  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') pageErrors.push(msg.text());
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  console.log('Page loaded with initial errors:', pageErrors);

  // Test clicking North Indian filter button
  console.log('\nTesting Menu Filter click:');
  const btnNorth = page.locator('#btn-north-indian');
  if (await btnNorth.count() > 0) {
    await btnNorth.click();
    console.log('Clicked North Indian button.');
  }

  // Test FAQ Accordion click
  console.log('\nTesting FAQ toggle click:');
  const faqBtn = page.locator('.faq-item button').first();
  if (await faqBtn.count() > 0) {
    await faqBtn.click();
    console.log('Clicked FAQ button.');
  }

  console.log('\nErrors after user interactions:', pageErrors);
  await browser.close();
}

testGooglyInteractivity().catch(console.error);
