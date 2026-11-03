const fs = require('fs');
const path = require('path');

const sitesDir = path.join(process.cwd(), 'web-dev-agency', 'public', 'sites');

console.log('====================================================');
console.log('🏷️ STAMPING ARCLANE AGENCY COURTESY CREDIT (ALL 501 SITES)');
console.log('====================================================\n');

function injectCredit(html, businessName) {
  if (html.includes('arclane-agency-credit') || html.includes('Concept &amp; Digital Architecture by')) {
    return html;
  }

  const cleanName = (businessName || 'All Rights Reserved').replace(/"/g, '&quot;');
  const creditHtml = `
    <!-- ArcLane Studios Agency Courtesy Credit (Brand Signature) -->
    <div class="arclane-agency-credit w-full py-4 mt-8 border-t border-zinc-800/80 bg-black/40 text-center text-xs text-zinc-500">
        <div class="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-center gap-2">
            <span>© 2026 ${cleanName}. All rights reserved.</span>
            <span class="hidden sm:inline text-zinc-700">•</span>
            <a href="https://www.arclanestudios.space" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 font-medium text-zinc-400 hover:text-white transition-colors group">
                <span>Concept &amp; Digital Architecture by</span>
                <span class="text-white font-bold tracking-tight group-hover:text-amber-400 transition-colors">ArcLane Studios</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-zinc-500 group-hover:text-amber-400 transition-colors"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </a>
        </div>
    </div>`;

  if (html.includes('</footer>')) {
    return html.replace('</footer>', `${creditHtml}\n</footer>`);
  } else if (html.includes('</body>')) {
    return html.replace('</body>', `${creditHtml}\n</body>`);
  }
  return html + creditHtml;
}

let stampedCount = 0;

for (let i = 1; i <= 501; i++) {
  const p = path.join(process.cwd(), 'reports', String(i), 'outreach.json');
  if (!fs.existsSync(p)) continue;
  const outreach = JSON.parse(fs.readFileSync(p, 'utf8'));
  const slug = outreach.slug || outreach.deployedUrl?.split('/').pop();
  const htmlPath = path.join(sitesDir, slug, 'index.html');

  if (!fs.existsSync(htmlPath)) continue;

  const html = fs.readFileSync(htmlPath, 'utf8');
  const updatedHtml = injectCredit(html, outreach.businessName);

  if (updatedHtml !== html) {
    fs.writeFileSync(htmlPath, updatedHtml, 'utf8');
    stampedCount++;
  }
}

console.log(`✅ Stamped ArcLane Agency Courtesy Credit on ${stampedCount} / 501 sites!`);
