const fs = require('fs');
const path = require('path');
const { WebsiteBuilder } = require('../src/builder.js');

const builder = new WebsiteBuilder();
const dirtyHtml = `<!DOCTYPE html>
<html>
<head></head>
<body>
<p>Hello</p>
<script>
  document.getElementById('current-year').textContent = new Date().getFullYear();
</script>
</body>
</html>`;

const cleaned = builder.enforceDesignQualityStandards(dirtyHtml, 'test-slug', 'Test Business');
console.log('Resulting HTML:\n', cleaned);

