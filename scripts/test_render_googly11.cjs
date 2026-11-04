const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

async function testGoogly11() {
  const filePath = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites', 'googly11', 'index.html');
  let html = fs.readFileSync(filePath, 'utf8');

  // 1. Fix unclosed opening tags followed by inner text and unclosed closing tag
  html = html.replace(/<([a-zA-Z0-9-]+)(\s+[^>]*?=["'][^"']*?["'])([^<>]*?)<\/\1(?![a-zA-Z0-9_>-])>?/gi, (match, tag, attrs, text) => {
    return `<${tag}${attrs}>${text}</${tag}>`;
  });

  // 2. Fix empty tag matches (e.g. <i class="..."</i)
  html = html.replace(/<([a-zA-Z0-9-]+)(\s+[^>]*?=["'][^"']*?["'])<\/\1(?![a-zA-Z0-9_>-])>?/gi, (match, tag, attrs) => {
    return `<${tag}${attrs}></${tag}>`;
  });

  // 3. Fix empty responsive prefixes: e.g. text-2xl sm: md: lg: xl:
  html = html.replace(/\b(?:sm|md|lg|xl|2xl):\s+/g, '');

  // 4. Clean up H1 typography in googly11
  html = html.replace(/class=["'][^"']*?text-2xl\s+sm:text-4xl\s+md:text-5xl\s+lg:text-5xl\s+xl:text-6xl[^"']*?["']/g, 
    'class="font-syne font-extrabold text-3xl sm:text-4xl lg:text-5xl text-white leading-tight tracking-tight mb-6"');

  fs.writeFileSync(filePath, html, 'utf8');
  console.log('Saved patched googly11/index.html');

  // Now render with Playwright
  const browser = await chromium.launch();
  
  // Desktop 1440x900
  const deskContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const deskPage = await deskContext.newPage();
  const fileUrl = 'file:///' + filePath.replace(/\\/g, '/');
  await deskPage.goto(fileUrl, { waitUntil: 'networkidle' });

  const brainDir = 'C:/Users/Ameya Sharma/.gemini/antigravity/brain/67c99f3b-c99f-44a1-a9b7-149049c6a9d6';
  
  // Screenshots
  await deskPage.screenshot({ path: path.join(brainDir, 'googly11_fixed_desktop_hero.png'), clip: { x: 0, y: 0, width: 1440, height: 900 } });
  
  await deskPage.locator('#menu').scrollIntoViewIfNeeded();
  await deskPage.screenshot({ path: path.join(brainDir, 'googly11_fixed_desktop_menu.png') });

  await deskPage.locator('#gallery').scrollIntoViewIfNeeded();
  await deskPage.screenshot({ path: path.join(brainDir, 'googly11_fixed_desktop_gallery.png') });

  await deskPage.screenshot({ path: path.join(brainDir, 'googly11_fixed_desktop_full.png'), fullPage: true });

  // Mobile 390x844
  const mobContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobPage = await mobContext.newPage();
  await mobPage.goto(fileUrl, { waitUntil: 'networkidle' });
  await mobPage.screenshot({ path: path.join(brainDir, 'googly11_fixed_mobile_hero.png'), clip: { x: 0, y: 0, width: 390, height: 844 } });
  await mobPage.locator('#menu').scrollIntoViewIfNeeded();
  await mobPage.screenshot({ path: path.join(brainDir, 'googly11_fixed_mobile_menu.png') });

  // Evaluate DOM metrics
  const metrics = await deskPage.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.menu-card'));
    const galImages = Array.from(document.querySelectorAll('#gallery img'));
    const h1 = document.querySelector('h1');
    return {
      menuCardsCount: cards.length,
      menuCardHeights: cards.map(c => Math.round(c.getBoundingClientRect().height)),
      menuCardWidths: cards.map(c => Math.round(c.getBoundingClientRect().width)),
      galleryImagesCount: galImages.length,
      galleryRects: galImages.map(img => ({
        w: Math.round(img.getBoundingClientRect().width),
        h: Math.round(img.getBoundingClientRect().height)
      })),
      h1Lines: h1 ? h1.getClientRects().length : 0,
      h1FontSize: h1 ? window.getComputedStyle(h1).fontSize : '',
      h1Height: h1 ? Math.round(h1.getBoundingClientRect().height) : 0
    };
  });

  console.log('Metrics:', JSON.stringify(metrics, null, 2));

  await browser.close();
}

testGoogly11().catch(console.error);
