const fs = require('fs');
const path = require('path');

function injectUnifiedFooter(html, businessName = '') {
  if (!html || typeof html !== 'string') return html;

  const cleanName = (businessName || 'All Rights Reserved').replace(/"/g, '&quot;');

  // 1. Purge any duplicate or legacy arclane-agency-credit blocks and existing signatures
  let cleaned = html.replace(/<!-- ArcLane Studios Agency Courtesy Credit[\s\S]*?<\/div>\s*<\/div>/gi, '');
  cleaned = cleaned.replace(/<div class=["']arclane-agency-credit[\s\S]*?<\/div>\s*<\/div>/gi, '');
  cleaned = cleaned.replace(/<div class=["']arclane-agency-credit[\s\S]*?<\/div>/gi, '');
  cleaned = cleaned.replace(/<!-- Unified ArcLane Verified Footer Signature[\s\S]*?<!-- End ArcLane Signature -->/gi, '');

  // 2. Adjust footer tag padding: pt-12 sm:pt-16 pb-28 md:pb-16 (clears sticky mobile bar)
  cleaned = cleaned.replace(/(<footer\b[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, classes, p3) => {
    let c = classes.replace(/\bpy-\d+\b/g, '').replace(/\bpb-\d+\b/g, '').replace(/\bpt-\d+\b/g, '').replace(/\bmd:pb-\d+\b/g, '').trim();
    return `${p1}${c} pt-12 sm:pt-16 pb-28 md:pb-16${p3}`;
  });

  const signatureInner = `
            <!-- Unified ArcLane Verified Footer Signature -->
            <div class="pt-8 mt-8 sm:mt-12 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-4">
                <p>&copy; <span id="current-year">2026</span> ${cleanName}. All rights reserved.</p>
                <a href="https://www.arclanestudios.space" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 font-medium text-zinc-400 hover:text-white transition-colors group">
                    <span>Concept &amp; Digital Architecture by</span>
                    <span class="text-white font-bold tracking-tight group-hover:text-amber-400 transition-colors">ArcLane Studios</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-zinc-500 group-hover:text-amber-400 transition-colors"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>
                <div class="flex items-center gap-4 text-zinc-500">
                    <span class="hover:text-zinc-400 cursor-pointer">Privacy Policy</span>
                    <span>•</span>
                    <span class="hover:text-zinc-400 cursor-pointer">Terms of Service</span>
                </div>
            </div>
            <!-- End ArcLane Signature -->`;

  const footerMatch = cleaned.match(/<footer[\s\S]*?<\/footer>/i);
  if (footerMatch) {
    let f = footerMatch[0];
    
    // Remove any previous bottom copyright bars inside footer
    const bottomBarRegex = /<(?:div|section)[^>]*class=["'][^"']*(?:pt-8|border-t|mt-8|text-center|justify-between)[^"']*["'][^>]*>[\s\S]*?(?:&copy;|©|current-year|All rights reserved)[\s\S]*?<\/(?:div|section)>/i;
    f = f.replace(bottomBarRegex, '');

    // Now insert signature inside the inner container (before the last </div> of footer)
    const lastDivIdx = f.lastIndexOf('</div>');
    if (lastDivIdx !== -1) {
      f = f.slice(0, lastDivIdx) + signatureInner + '\n        </div>\n    </footer>';
    } else {
      f = f.replace(/<\/footer>/i, `<div class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">${signatureInner}</div>\n</footer>`);
    }

    cleaned = cleaned.replace(footerMatch[0], f);
  } else if (cleaned.includes('</body>')) {
    cleaned = cleaned.replace('</body>', `<div class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-28 md:pb-16">${signatureInner}</div>\n</body>`);
  }

  // Ensure current-year script is safe
  cleaned = cleaned.replace(/document\.getElementById\(['"]current-year['"]\)\.textContent\s*=\s*[^;]+;/gi, 
    `const cyEl = document.getElementById('current-year'); if (cyEl) cyEl.textContent = new Date().getFullYear();`);

  return cleaned;
}

// Test on googly11 and 5 other random sites
const sitesDir = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites');
const testSites = ['googly11', 'drmonika', 'crossfitpatna', 'cakeboss', 'bakenbitebliss'];

testSites.forEach(s => {
  const f = path.join(sitesDir, s, 'index.html');
  if (fs.existsSync(f)) {
    const raw = fs.readFileSync(f, 'utf8');
    const fixed = injectUnifiedFooter(raw, s);
    const openDivs = (fixed.match(/<div\b/gi) || []).length;
    const closeDivs = (fixed.match(/<\/div>/gi) || []).length;
    console.log(`Site: ${s} | openDivs: ${openDivs}, closeDivs: ${closeDivs}, diff: ${openDivs - closeDivs}`);
  }
});

