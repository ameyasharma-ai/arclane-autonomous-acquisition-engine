const fs = require('fs');
const path = require('path');
const { WebsiteBuilder } = require('../src/builder.js');

async function testFixCommandPipeline() {
  const builder = new WebsiteBuilder();

  // Create a dirty test HTML that mimics all the edge cases we found
  const dirtyHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Test Business</title>
</head>
<body class="bg-black text-white pb-24 md:pb-0">
  <header class="bg-transparent"><a href="#">Test Business</a></header>
  <section>
    <h1 class="text-2xl sm:text-4xl md:text-5xl lg:text-5xl xl:text-6xl text-2xl sm: md: lg: xl: font-extrabold font-syne text-white leading-[1.15] mb-6">
      Delicious Treats in Patna!
    </h1>
    <div class="menu-card">
      <span class="absolute top-3 right-3 bg-zinc-900 text-secondary font-bold text-xs"₹240</span
    </div>
    <div class="menu-card">
      <span class="absolute top-3 right-3 bg-zinc-900 text-secondary font-bold text-xs"₹180</span
    </div>
    <div class="stats">
      <p class="text-2xl font-extrabold font-syne text-primary">Super Fast</p>
    </div>
  </section>
  <footer class="bg-zinc-950 border-t border-zinc-800 py-16">
    <div class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div>Footer Column 1</div>
      <div>Footer Column 2</div>
    </div>
  </footer>
  <script>
    document.getElementById('current-year').textContent = new Date().getFullYear();
  </script>
</body>
</html>`;

  console.log('Running enforceDesignQualityStandards on dirty test HTML...');
  const cleanedHtml = builder.enforceDesignQualityStandards(dirtyHtml, 'test-slug', 'Test Business');

  const cyMatches = cleanedHtml.match(/.*current-year.*/g);
  console.log('Lines containing current-year in cleanedHtml:\n', cyMatches);

  // Assertions:
  const brokenTags = cleanedHtml.match(/<([a-zA-Z0-9-]+)(\s+[^>]*?=["'][^"']*?["'])([^<>]*?)<\/\1(?![a-zA-Z0-9_>-])>?/gi);
  const emptyPrefixes = cleanedHtml.match(/\b(?:sm|md|lg|xl|2xl):\s+/g);
  const footerHasPb28 = cleanedHtml.includes('pb-28 md:pb-16');
  const footerSigInside = cleanedHtml.includes('<!-- Unified ArcLane Verified Footer Signature -->') &&
                          cleanedHtml.indexOf('<!-- Unified ArcLane Verified Footer Signature -->') < cleanedHtml.lastIndexOf('</div>');
  const openDivs = (cleanedHtml.match(/<div\b/gi) || []).length;
  const closeDivs = (cleanedHtml.match(/<\/div>/gi) || []).length;
  const safeScript = cleanedHtml.includes("const cyEl = document.getElementById('current-year')");

  console.log('--- TEST RESULTS ---');
  console.log('1. Broken tags remaining:', brokenTags ? brokenTags.length : 0);
  console.log('2. Empty prefixes remaining:', emptyPrefixes ? emptyPrefixes.length : 0);
  console.log('3. Footer has pb-28 md:pb-16 clearance:', footerHasPb28);
  console.log('4. Footer signature INSIDE max-w container:', footerSigInside);
  console.log(`5. Div balance: open=${openDivs}, close=${closeDivs}, diff=${openDivs - closeDivs}`);
  console.log('6. Script TypeError protection:', safeScript);

  if (!brokenTags && !emptyPrefixes && footerHasPb28 && footerSigInside && openDivs === closeDivs && safeScript) {
    console.log('\n✅ ALL VERIFICATION CHECKS PASSED PERFECTLY FOR /fix PIPELINE!');
  } else {
    console.error('\n❌ VERIFICATION CHECKS FAILED!');
    process.exit(1);
  }
}

testFixCommandPipeline().catch(console.error);
