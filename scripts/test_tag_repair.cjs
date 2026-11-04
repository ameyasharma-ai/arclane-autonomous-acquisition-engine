const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites', 'googly11', 'index.html');
let html = fs.readFileSync(file, 'utf8');

// Regex:
// Group 1: tag name (e.g. span, i, h3, p)
// Group 2: attributes including closing quote (e.g. class="...")
// Group 3: inner content before </tag
const fixed = html.replace(/<([a-zA-Z0-9-]+)(\s+[^>]*?=["'][^"']*?["'])([^<>]*?)<\/\1(?![a-zA-Z0-9_>-])>?/gi, (match, tag, attrs, text) => {
  console.log(`Fixing match: [${match}]\n  -> <${tag}${attrs}>${text}</${tag}>`);
  return `<${tag}${attrs}>${text}</${tag}>`;
});

// Also test: <i data-lucide="flame" class="w-3.5 h-3.5 fill-amber-400"</i
const fixed2 = fixed.replace(/<([a-zA-Z0-9-]+)(\s+[^>]*?=["'][^"']*?["'])<\/\1(?![a-zA-Z0-9_>-])>?/gi, (match, tag, attrs) => {
  console.log(`Fixing empty tag match: [${match}]\n  -> <${tag}${attrs}></${tag}>`);
  return `<${tag}${attrs}></${tag}>`;
});

console.log('Test completed.');
