const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function patchGoogly(html) {
  let cleaned = html;

  // 1. Remove invalid meta X-Frame-Options
  cleaned = cleaned.replace(/<meta\s+http-equiv=["']X-Frame-Options["'][^>]*>/gi, '');

  // 2. Fix stray > after closing tags like </div>>
  cleaned = cleaned.replace(/<\/(div|section|span|p|a|h[1-6]|header|footer|ul|li)>>+/gi, '</$1>');

  // 3. Ensure id="current-year" exists in the footer so script doesn't crash
  if (!cleaned.includes('id="current-year"')) {
    cleaned = cleaned.replace(/&copy;\s*2026/i, '&copy; <span id="current-year">2026</span>');
  }

  // 4. Also wrap script document.getElementById('current-year') in safe null check
  cleaned = cleaned.replace(/document\.getElementById\(['"]current-year['"]\)\.textContent\s*=\s*[^;]+;/gi, (m) => {
    return `const cyEl = document.getElementById('current-year'); if (cyEl) cyEl.textContent = new Date().getFullYear();`;
  });

  return cleaned;
}

const file = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites', 'googly11', 'index.html');
const raw = fs.readFileSync(file, 'utf8');
const patched = patchGoogly(raw);
fs.writeFileSync(file, patched, 'utf8');

async function verify() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const url = 'file:///' + file.replace(/\\/g, '/');
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  const aboutText = await page.evaluate(() => {
    const about = document.getElementById('about');
    return about ? about.innerText.slice(0, 100).replace(/\s+/g, ' ') : '';
  });

  console.log('About section preview:', aboutText);
  console.log('Console / Runtime Errors after patch:', errors);

  await browser.close();
}

verify().catch(console.error);
