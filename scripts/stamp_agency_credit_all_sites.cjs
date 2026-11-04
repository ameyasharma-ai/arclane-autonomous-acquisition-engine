const fs = require('fs');
const path = require('path');

const sitesDir = path.join(process.cwd(), 'web-dev-agency', 'public', 'sites');
const reportsDir = path.join(process.cwd(), 'reports');

console.log('====================================================');
console.log('🏷️ UNIFYING ARCLANE AGENCY COURTESY CREDIT (ALL 501 SITES)');
console.log('====================================================\n');

function replaceBottomBarWithBalancing(footerHtml, replacementHtml) {
  let f = footerHtml;
  const startMatch = f.match(/<(?:div|section)[^>]*class=["'][^"']*(?:pt-8|border-t|mt-8|text-center|justify-between)[^"']*["'][^>]*>(?=[\s\S]*?(?:&copy;|©|current-year|All rights reserved))/i);
  if (!startMatch) {
    return f.replace(/<\/footer>/i, `${replacementHtml}\n</footer>`);
  }

  const startIdx = startMatch.index;
  const tagContent = f.slice(startIdx);

  let depth = 0;
  let endIdx = -1;
  const tagRegex = /<\/?(?:div|section)\b[^>]*>/gi;
  let match;

  while ((match = tagRegex.exec(tagContent)) !== null) {
    const isClose = match[0].startsWith('</');
    if (!isClose) {
      depth++;
    } else {
      depth--;
      if (depth === 0) {
        endIdx = startIdx + match.index + match[0].length;
        break;
      }
    }
  }

  if (endIdx !== -1) {
    return f.slice(0, startIdx) + replacementHtml + f.slice(endIdx);
  }

  return f.replace(/<\/footer>/i, `${replacementHtml}\n</footer>`);
}

function injectUnifiedCredit(html, businessName) {
  let cleaned = html.replace(/<!-- ArcLane Studios Agency Courtesy Credit[\s\S]*?<\/div>\s*<\/div>/gi, '');
  cleaned = cleaned.replace(/<div class=["']arclane-agency-credit[\s\S]*?<\/div>\s*<\/div>/gi, '');
  cleaned = cleaned.replace(/<div class=["']arclane-agency-credit[\s\S]*?<\/div>/gi, '');
  cleaned = cleaned.replace(/<!-- Unified ArcLane Verified Footer Signature[\s\S]*?<!-- End ArcLane Signature -->/gi, '');

  const cleanName = (businessName || 'All Rights Reserved').replace(/"/g, '&quot;');
  const unifiedBottomBar = `
            <!-- Unified ArcLane Verified Footer Signature -->
            <div class="pt-8 mt-8 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-4">
                <p>&copy; 2026 ${cleanName}. All rights reserved.</p>
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
    const newFooter = replaceBottomBarWithBalancing(footerMatch[0], unifiedBottomBar);
    cleaned = cleaned.replace(footerMatch[0], newFooter);
  } else if (cleaned.includes('</body>')) {
    cleaned = cleaned.replace('</body>', `${unifiedBottomBar}\n</body>`);
  }

  return cleaned;
}

let stampedCount = 0;

for (let i = 1; i <= 501; i++) {
  const outreachPath = path.join(reportsDir, String(i), 'outreach.json');
  if (!fs.existsSync(outreachPath)) continue;

  const outreach = JSON.parse(fs.readFileSync(outreachPath, 'utf8'));
  const slug = outreach.slug || (outreach.deployedUrl && outreach.deployedUrl.split('/').pop());
  const htmlPath = path.join(sitesDir, slug, 'index.html');

  if (!fs.existsSync(htmlPath)) continue;

  const raw = fs.readFileSync(htmlPath, 'utf8');
  const clean = injectUnifiedCredit(raw, outreach.businessName);

  fs.writeFileSync(htmlPath, clean, 'utf8');
  stampedCount++;

  if (stampedCount % 100 === 0 || stampedCount === 501) {
    console.log(`⏱️ Unified footer credit on ${stampedCount}/501 sites...`);
  }
}

console.log(`\n🎉 Successfully unified ArcLane courtesy credit across all ${stampedCount} sites!`);
