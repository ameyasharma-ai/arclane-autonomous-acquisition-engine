/**
 * ArcLane Navbar Brand Truncation & Fluid Layout Upgrade Engine
 * 
 * Root Cause:
 * An artificial `max-w-[160px] xs:max-w-[200px] sm:max-w-none` clamp was forced on
 * brand logo titles. Since Tailwind CSS CDN has NO `xs:` breakpoint, all mobile
 * screens (< 640px) were hard-capped at 160px width, prematurely truncating names
 * like "HULK FITNESS" into "HULK FI..." even though there were 150px of empty space!
 * 
 * Solution:
 * 1. Remove artificial pixel clamps (max-w-[160px], xs:max-w-[200px], sm:max-w-none, max-w-[180px]).
 * 2. Allow brand link to naturally utilize available flex space (`min-w-0 flex-1 sm:flex-initial`).
 * 3. Give hamburger menu button `shrink-0` so it is never compressed.
 * 4. Fix any lingering `overflow-x-hidden-0` syntax on <body> to ensure clean horizontal clipping.
 */

const fs = require('fs');
const path = require('path');

const sitesDir = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites');

if (!fs.existsSync(sitesDir)) {
  console.error(`❌ Sites directory not found at: ${sitesDir}`);
  process.exit(1);
}

const siteDirs = fs.readdirSync(sitesDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

console.log(`Auditing and fixing navbar brand layout across ${siteDirs.length} sites...`);

let totalUpdated = 0;
let totalChecked = 0;

for (const siteName of siteDirs) {
  const htmlPath = path.join(sitesDir, siteName, 'index.html');
  if (!fs.existsSync(htmlPath)) continue;

  totalChecked++;
  let html = fs.readFileSync(htmlPath, 'utf8');
  const original = html;

  // 1. Fix overflow-x-hidden-0 on body
  html = html.replace(/\boverflow-x-hidden-0\b/g, 'overflow-x-hidden');

  // 2. Normalize header brand link and its child spans
  html = html.replace(/(<header\b[^>]*>[\s\S]*?<\/header>)/gi, (headerHtml) => {
    let fixedHeader = headerHtml;

    // Ensure menu button has shrink-0
    fixedHeader = fixedHeader.replace(/(<button\b[^>]*id=["'](?:menu-btn|menu-toggle)["'][^>]*class=["'])([^"']*)(["'])/gi, (m, p1, cls, p3) => {
      let c = cls;
      if (!c.includes('shrink-0')) c += ' shrink-0';
      return `${p1}${c.replace(/\s+/g, ' ').trim()}${p3}`;
    });

    // Fix brand link <a>
    fixedHeader = fixedHeader.replace(/(<a\b[^>]*class=["'])([^"']*(?:items-center)[^"']*)(["'])/i, (m, p1, cls, p3) => {
      let c = cls;
      c = c.replace(/\bshrink-0\b/g, '');
      if (!c.includes('min-w-0')) c += ' min-w-0';
      if (!c.includes('flex-1')) c += ' flex-1 sm:flex-initial';
      return `${p1}${c.replace(/\s+/g, ' ').trim()}${p3}`;
    });

    // Strip artificial max-w clamps from title and subtitle spans inside header
    fixedHeader = fixedHeader.replace(/(<span\b[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, cls, p3) => {
      if (cls.includes('max-w-[') || cls.includes('xs:max-w-') || cls.includes('sm:max-w-none')) {
        let c = cls.replace(/\s*(?:xs:|sm:|md:|lg:|xl:)?max-w-\[[^\]]+\]/g, '')
                   .replace(/\s*\bsm:max-w-none\b/g, '');
        if (!c.includes('truncate')) c = `truncate ${c}`;
        if (!c.includes('block')) c = `${c} block`;
        return `${p1}${c.replace(/\s+/g, ' ').trim()}${p3}`;
      }
      return m;
    });

    return fixedHeader;
  });

  // 3. Also clean mobile-drawer brand logo if present
  html = html.replace(/(<div\b[^>]*id=["'](?:mobile-drawer|mobile-menu)["'][\s\S]*?<\/div>)/i, (drawerHtml) => {
    let fixedDrawer = drawerHtml.replace(/(<span\b[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, cls, p3) => {
      if (cls.includes('max-w-[')) {
        let c = cls.replace(/\s*(?:xs:|sm:|md:|lg:|xl:)?max-w-\[[^\]]+\]/g, '')
                   .replace(/\s*\bsm:max-w-none\b/g, '');
        if (!c.includes('truncate')) c = `truncate ${c}`;
        return `${p1}${c.replace(/\s+/g, ' ').trim()}${p3}`;
      }
      return m;
    });
    return fixedDrawer;
  });

  if (html !== original) {
    fs.writeFileSync(htmlPath, html, 'utf8');
    totalUpdated++;
  }
}

console.log(`✅ Navbar brand layout update complete! Checked: ${totalChecked}, Updated: ${totalUpdated} sites.`);
