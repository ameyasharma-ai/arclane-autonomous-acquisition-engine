const fs = require('fs');
const path = require('path');
const sitesDir = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites');
const sites = fs.readdirSync(sitesDir).filter(s => fs.statSync(path.join(sitesDir, s)).isDirectory());

let brokenTagFixes = 0;
let emptyPrefixFixes = 0;
let divDiffNonZero = 0;
let totalSites = sites.length;

sites.forEach(s => {
  const indexFile = path.join(sitesDir, s, 'index.html');
  if (fs.existsSync(indexFile)) {
    let html = fs.readFileSync(indexFile, 'utf8');

    // Count broken tags
    const brokenMatches = html.match(/<([a-zA-Z0-9-]+)(\s+[^>]*?=["'][^"']*?["'])([^<>]*?)<\/\1(?![a-zA-Z0-9_>-])>?/gi);
    if (brokenMatches) brokenTagFixes += brokenMatches.length;

    // Count empty prefixes
    const prefixMatches = html.match(/\b(?:sm|md|lg|xl|2xl):\s+/g);
    if (prefixMatches) emptyPrefixFixes += prefixMatches.length;

    // Apply fixes
    html = html.replace(/<([a-zA-Z0-9-]+)(\s+[^>]*?=["'][^"']*?["'])([^<>]*?)<\/\1(?![a-zA-Z0-9_>-])>?/gi, (m, tag, attrs, text) => {
      return `<${tag}${attrs}>${text}</${tag}>`;
    });
    html = html.replace(/<([a-zA-Z0-9-]+)(\s+[^>]*?=["'][^"']*?["'])<\/\1(?![a-zA-Z0-9_>-])>?/gi, (m, tag, attrs) => {
      return `<${tag}${attrs}></${tag}>`;
    });
    html = html.replace(/\b(?:sm|md|lg|xl|2xl):\s+/g, '');

    const openDivs = (html.match(/<div\b/gi) || []).length;
    const closeDivs = (html.match(/<\/div>/gi) || []).length;
    if (openDivs !== closeDivs) {
      divDiffNonZero++;
    }
  }
});

console.log(`Total sites: ${totalSites}`);
console.log(`Broken tag instances to fix: ${brokenTagFixes}`);
console.log(`Empty prefix instances to fix: ${emptyPrefixFixes}`);
console.log(`Sites where openDivs !== closeDivs after tag fix: ${divDiffNonZero}`);
