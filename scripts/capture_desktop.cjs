const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function captureDesktop() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const file = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites', 'googly11', 'index.html');
  const url = 'file:///' + file.replace(/\\/g, '/');
  await page.goto(url, { waitUntil: 'networkidle' });

  // Take full page screenshot
  const fullScreenshotPath = path.join(__dirname, '..', 'googly11_desktop_1440_full.png');
  await page.screenshot({ path: fullScreenshotPath, fullPage: true });

  // Take viewport screenshots of key sections
  const heroPath = path.join(__dirname, '..', 'googly11_desktop_hero.png');
  await page.screenshot({ path: heroPath });

  // Scroll down to menu
  const menuEl = page.locator('#menu');
  if (await menuEl.count() > 0) {
    await menuEl.scrollIntoViewIfNeeded();
    const menuPath = path.join(__dirname, '..', 'googly11_desktop_menu.png');
    await page.screenshot({ path: menuPath });
  }

  // Scroll down to about/gallery
  const aboutEl = page.locator('#about');
  if (await aboutEl.count() > 0) {
    await aboutEl.scrollIntoViewIfNeeded();
    const aboutPath = path.join(__dirname, '..', 'googly11_desktop_about.png');
    await page.screenshot({ path: aboutPath });
  }

  // Copy screenshots to brain directory
  const brainDir = 'C:/Users/Ameya Sharma/.gemini/antigravity/brain/67c99f3b-c99f-44a1-a9b7-149049c6a9d6';
  ['googly11_desktop_1440_full.png', 'googly11_desktop_hero.png', 'googly11_desktop_menu.png', 'googly11_desktop_about.png'].forEach(f => {
    fs.copyFileSync(path.join(__dirname, '..', f), path.join(brainDir, f));
  });

  console.log('Desktop screenshots captured and copied to brain directory.');

  // Check CSS styles and layout computation on desktop
  const layoutInfo = await page.evaluate(() => {
    const heroH1 = document.querySelector('h1');
    const heroImg = document.querySelector('section img');
    const menuGrid = document.getElementById('menu-grid');
    const menuCards = Array.from(document.querySelectorAll('.menu-card'));
    
    return {
      h1FontSize: heroH1 ? window.getComputedStyle(heroH1).fontSize : 'none',
      h1LineHeight: heroH1 ? window.getComputedStyle(heroH1).lineHeight : 'none',
      h1Width: heroH1 ? heroH1.getBoundingClientRect().width : 0,
      heroImgHeight: heroImg ? heroImg.getBoundingClientRect().height : 0,
      heroImgWidth: heroImg ? heroImg.getBoundingClientRect().width : 0,
      menuGridCols: menuGrid ? window.getComputedStyle(menuGrid).gridTemplateColumns : 'none',
      menuGridWidth: menuGrid ? menuGrid.getBoundingClientRect().width : 0,
      card1Width: menuCards[0] ? menuCards[0].getBoundingClientRect().width : 0,
      card1Height: menuCards[0] ? menuCards[0].getBoundingClientRect().height : 0,
      menuCardDisplay: menuCards[0] ? window.getComputedStyle(menuCards[0]).display : 'none',
      menuCardFlexDir: menuCards[0] ? window.getComputedStyle(menuCards[0]).flexDirection : 'none',
    };
  });

  console.log('Layout Info:', JSON.stringify(layoutInfo, null, 2));

  await browser.close();
}

captureDesktop().catch(console.error);
