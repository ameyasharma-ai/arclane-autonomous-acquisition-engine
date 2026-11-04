const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function inspectGoogly11() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const url = 'https://www.arclanestudios.space/sites/googly11';
  console.log('Navigating to:', url);

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto(url, { waitUntil: 'networkidle' });

  // Take full page screenshot
  const screenshotPath = path.join(__dirname, '..', 'googly11_live.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved to:', screenshotPath);

  // Evaluate page structure
  const pageInfo = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('header, section, footer, div[id]'));
    const sectionData = sections.map(s => {
      const rect = s.getBoundingClientRect();
      const imgs = Array.from(s.querySelectorAll('img')).map(img => ({
        src: img.src,
        alt: img.alt,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        visible: img.offsetParent !== null
      }));
      return {
        tag: s.tagName,
        id: s.id,
        className: s.className ? s.className.slice(0, 80) : '',
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        textLength: s.innerText ? s.innerText.trim().length : 0,
        textPreview: s.innerText ? s.innerText.trim().slice(0, 100).replace(/\s+/g, ' ') : '',
        images: imgs
      };
    });

    const footer = document.querySelector('footer');
    const footerHtml = footer ? footer.innerHTML : 'No footer';

    return {
      title: document.title,
      scrollHeight: document.documentElement.scrollHeight,
      sectionCount: sections.length,
      sections: sectionData,
      footerSnippet: footerHtml.slice(footerHtml.lastIndexOf('<div class="pt-8'))
    };
  });

  console.log('Title:', pageInfo.title);
  console.log('ScrollHeight:', pageInfo.scrollHeight);
  console.log('Console Errors:', errors);
  console.log('\nSections Breakdown:');
  pageInfo.sections.forEach((s, idx) => {
    console.log(`[${idx + 1}] ${s.tag}#${s.id || '(no-id)'} | Height: ${s.height}px | TextLen: ${s.textLength} | Imgs: ${s.images.length}`);
    if (s.images.length > 0) {
      s.images.forEach((img, i) => {
        console.log(`     Img ${i + 1}: ${img.src.slice(0, 80)}... [${img.naturalWidth}x${img.naturalHeight}]`);
      });
    }
    console.log(`     Text: "${s.textPreview}"`);
  });

  await browser.close();
}

inspectGoogly11().catch(console.error);
