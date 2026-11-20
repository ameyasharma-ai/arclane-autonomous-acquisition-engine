/**
 * ArcLane White Footer Gap & Mobile Sticky Bar Normalization Engine
 * 
 * Root Cause:
 * 1. <body> having `pb-20 md:pb-0` creates 80px of bottom padding on the body element.
 *    Since padding-bottom renders *after* all body children (including <footer>),
 *    on any site with a light body background and a dark footer, this manifested
 *    as an ugly white gap beneath the dark footer.
 * 2. Mobile sticky action bars had mangled Tailwind classes `fixed bottom left right`
 *    instead of `fixed inset-x-0 bottom-0`.
 * 
 * Solution:
 * - Strip all bottom padding (`pb-*`) from `<body>`.
 * - Place clearance `pb-24 md:pb-12` directly on `<footer>` so the footer's dark
 *   background extends seamlessly flush to the bottom of the page.
 * - Replace `fixed bottom left right` with standard `fixed inset-x-0 bottom-0`.
 * - Fix dangling prefixes (`sm: md:`) and truncated classes (`sticky top` -> `sticky top-0`, `fixed inset` -> `fixed inset-0`).
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

console.log(`Found ${siteDirs.length} site directories in ${sitesDir}`);

let totalUpdated = 0;
let totalChecked = 0;

for (const siteName of siteDirs) {
  const htmlPath = path.join(sitesDir, siteName, 'index.html');
  if (!fs.existsSync(htmlPath)) continue;

  totalChecked++;
  let html = fs.readFileSync(htmlPath, 'utf8');
  const original = html;

  // 1. Clean <body> classes: strip pb-* and dangling lg:pb
  html = html.replace(/(<body\b[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, classes, p3) => {
    let c = classes;
    c = c.replace(/\s*\b(?:lg:pb|pb-(?:32|28|24|20|16|12|10|8|6|4|0)|md:pb-0|sm:pb-0)\b/g, '');
    if (!c.includes('overflow-x-hidden')) c = `overflow-x-hidden ${c}`;
    c = c.replace(/\s+/g, ' ').trim();
    return `${p1}${c}${p3}`;
  });

  // 2. Ensure <footer> has pb-24 md:pb-12 and clean dangling prefixes
  html = html.replace(/(<footer\b[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, cls, p3) => {
    let c = cls;
    // Remove dangling prefixes like "sm: md: "
    c = c.replace(/\b(?:sm|md|lg|xl|2xl):\s+/g, ' ');
    // Remove old pb-*
    c = c.replace(/\s*\bpb-(?:32|28|24|20|16|12|10|8|6|4|0)\b/g, '');
    c = c.replace(/\s*\b(?:md|sm|lg):pb-(?:32|28|24|20|16|12|10|8|6|4|0)\b/g, '');
    c = `${c} pb-24 md:pb-12`;
    c = c.replace(/\s+/g, ' ').trim();
    return `${p1}${c}${p3}`;
  });

  // 3. Fix sticky mobile bottom action bar classes
  html = html.replace(/(<div\b[^>]*class=["'][^"']*fixed[^"']*)\b(?:bottom\s+left\s+right|bottom-0\s+left-0\s+right-0)\b/gi, '$1inset-x-0 bottom-0');
  // Also handle cases where bottom left right might be before or after other attributes
  html = html.replace(/class=["']([^"']*?)\bfixed\s+bottom\s+left\s+right\b([^"']*?)["']/gi, 'class="$1fixed inset-x-0 bottom-0$2"');

  // 4. Fix dangling responsive prefixes anywhere in class attributes (e.g., class="... sm: md: ...")
  html = html.replace(/class=["']([^"']*?)["']/gi, (match, classStr) => {
    if (/\b(?:sm|md|lg|xl|2xl):\s+/.test(classStr)) {
      const fixed = classStr.replace(/\b(?:sm|md|lg|xl|2xl):\s+/g, ' ').replace(/\s+/g, ' ').trim();
      return `class="${fixed}"`;
    }
    return match;
  });

  // 5. Fix sticky top -> sticky top-0 and fixed inset -> fixed inset-0
  html = html.replace(/(<header\b[^>]*class=["'][^"']*sticky\s+)top\b(?!\S|-)/gi, '$1top-0');
  html = html.replace(/(<div\b[^>]*class=["'][^"']*fixed\s+)inset\b(?!\S|-)/gi, '$1inset-0');

  if (html !== original) {
    fs.writeFileSync(htmlPath, html, 'utf8');
    totalUpdated++;
  }
}

console.log(`✅ Completed! Checked: ${totalChecked}, Updated: ${totalUpdated} sites.`);
