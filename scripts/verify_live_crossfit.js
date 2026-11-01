import { chromium } from 'playwright';

async function test() {
  console.log('Testing live site: https://www.arclanestudios.space/sites/crossfit ...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const res = await page.goto('https://www.arclanestudios.space/sites/crossfit?v=' + Date.now(), { waitUntil: 'networkidle', timeout: 35000 });
  console.log('HTTP Status:', res.status());
  const title = await page.title();
  console.log('Page Title:', title);

  const heroImg = await page.evaluate(() => {
    const el = document.querySelector('img[src*="featured-1.jpg"]');
    return el ? { src: el.src, alt: el.alt } : null;
  });
  console.log('Authentic Showcase Image:', heroImg);

  const bottomButtons = await page.evaluate(() => {
    const bar = document.querySelector('.fixed.bottom-0');
    return bar ? Array.from(bar.querySelectorAll('a, button')).map(e => e.innerText.trim()) : [];
  });
  console.log('Mobile Bottom Bar Buttons:', bottomButtons);

  await browser.close();
}

test().catch(console.error);
