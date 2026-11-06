const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

async function testGooglyFooter() {
  const filePath = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites', 'googly11', 'index.html');
  let html = fs.readFileSync(filePath, 'utf8');

  // Remove existing signature and empty spaces
  html = html.replace(/<!-- Unified ArcLane Verified Footer Signature[\s\S]*?<!-- End ArcLane Signature -->/gi, '');
  
  // Adjust footer classes to have pt-12 sm:pt-16 pb-28 md:pb-16
  html = html.replace(/(<footer\b[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, classes, p3) => {
    let c = classes.replace(/\bpy-\d+\b/g, '').replace(/\bpb-\d+\b/g, '').replace(/\bpt-\d+\b/g, '').replace(/\bmd:pb-\d+\b/g, '');
    return `${p1}${c.trim()} pt-12 sm:pt-16 pb-28 md:pb-16${p3}`;
  });

  const cleanName = 'Googly 11 Restaurant';
  const signature = `
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

  // We want to insert the signature INSIDE the max-w container of footer, right before its closing </div>
  // In googly11: <div class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"> ... </div> </footer>
  // Let's replace the closing </div> of that container:
  const footerMatch = html.match(/<footer[\s\S]*?<\/footer>/i);
  if (footerMatch) {
    let f = footerMatch[0];
    // Find the closing </div> of the inner container (which is the last </div> before </footer>)
    const lastDiv = f.lastIndexOf('</div>');
    if (lastDiv !== -1) {
      f = f.slice(0, lastDiv) + signature + '\n        </div>\n    </footer>';
      html = html.replace(footerMatch[0], f);
    }
  }

  fs.writeFileSync(filePath, html, 'utf8');
  console.log('Updated googly11 footer structure');

  // Verify in Playwright
  const browser = await chromium.launch();
  
  // Desktop 1440x900
  const deskPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const fileUrl = 'file:///' + filePath.replace(/\\/g, '/');
  await deskPage.goto(fileUrl, { waitUntil: 'networkidle' });
  await deskPage.locator('footer').scrollIntoViewIfNeeded();
  
  const brainDir = 'C:/Users/Ameya Sharma/.gemini/antigravity/brain/67c99f3b-c99f-44a1-a9b7-149049c6a9d6';
  await deskPage.screenshot({ path: path.join(brainDir, 'googly11_fixed_footer_desktop.png') });

  // Mobile 390x844
  const mobPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobPage.goto(fileUrl, { waitUntil: 'networkidle' });
  await mobPage.locator('footer').scrollIntoViewIfNeeded();
  await mobPage.screenshot({ path: path.join(brainDir, 'googly11_fixed_footer_mobile.png') });

  // Evaluate bounding rects of the signature bar
  const sigMetrics = await deskPage.evaluate(() => {
    const sig = document.querySelector('footer .border-t.border-zinc-800\\/80');
    const cols = document.querySelector('footer .grid');
    return {
      sigRect: sig ? sig.getBoundingClientRect() : null,
      colsRect: cols ? cols.getBoundingClientRect() : null
    };
  });
  console.log('Desktop Metrics:', JSON.stringify(sigMetrics, null, 2));

  const mobMetrics = await mobPage.evaluate(() => {
    const sig = document.querySelector('footer .border-t.border-zinc-800\\/80');
    const bottomBar = document.querySelector('.md\\:hidden.fixed.bottom-0');
    return {
      sigRect: sig ? sig.getBoundingClientRect() : null,
      bottomBarRect: bottomBar ? bottomBar.getBoundingClientRect() : null,
      // Is sig unobstructed by bottom bar?
      isUnobstructed: sig && bottomBar ? sig.getBoundingClientRect().bottom < bottomBar.getBoundingClientRect().top : false
    };
  });
  console.log('Mobile Metrics:', JSON.stringify(mobMetrics, null, 2));

  await browser.close();
}

testGooglyFooter().catch(console.error);

