const fs = require('fs');
const content = fs.readFileSync('src/builder.js', 'utf8');

const brokenMatches = content.match(/<([a-zA-Z0-9-]+)(\s+[^>]*?=["'][^"']*?["'])([^<>]*?)<\/\1(?![a-zA-Z0-9_>-])>?/gi);
console.log('Broken tags in src/builder.js:', brokenMatches ? brokenMatches.length : 0);
if (brokenMatches) {
  console.log('Samples:', brokenMatches.slice(0, 5));
}

const emptyPrefixes = content.match(/\b(?:sm|md|lg|xl|2xl):\s+/g);
console.log('Empty prefixes in src/builder.js:', emptyPrefixes ? emptyPrefixes.length : 0);

// Check H1 styling in builder.js
const h1Matches = content.match(/<h1[^>]*>/gi);
console.log('H1 in builder.js:', h1Matches);
