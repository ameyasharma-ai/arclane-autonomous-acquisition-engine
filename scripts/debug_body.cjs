const fs = require('fs');
const { WebsiteBuilder } = require('../src/builder.js');

const builder = new WebsiteBuilder();
const dirtyHtml = `<!DOCTYPE html>
<html lang="en">
<head><title>Test</title></head>
<body>
<p>Hello</p>
<footer class="bg-zinc-950 border-t border-zinc-800 py-16">
  <div class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div>Col 1</div>
  </div>
</footer>
<script>
  document.getElementById('current-year').textContent = new Date().getFullYear();
</script>
</body>
</html>`;

const cleanedHtml = builder.enforceDesignQualityStandards(dirtyHtml, 'test-slug', 'Test Business');
console.log('Resulting HTML body:\n', cleanedHtml.slice(cleanedHtml.indexOf('<body>')));
