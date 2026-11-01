import fs from 'fs';
import path from 'path';

const builderPath = path.join(process.cwd(), 'src', 'builder.js');
let raw = fs.readFileSync(builderPath, 'utf8');
const isCrlf = raw.includes('\r\n');
let content = raw.replace(/\r\n/g, '\n');

// 1. Update the call site in buildClientWebsite
const oldCall = `        // Apply deterministic design quality gate (guarantees solid header, top-11/12 mobile drawer spacing, rounded-tl-2xl, and backdrop overlay)
        htmlCode = this.enforceDesignQualityStandards(htmlCode);`;

const newCall = `        // Determine canonical slug
        const vercelSlug = await agencyPublisher.getSlug(businessName);

        // Apply deterministic design quality gate (guarantees solid header, top-11/12 mobile drawer spacing, rounded-tl-2xl, backdrop overlay, & triple-tier image fallbacks)
        htmlCode = this.enforceDesignQualityStandards(htmlCode, vercelSlug, businessName);`;

if (!content.includes(oldCall)) {
    console.error('Could not find oldCall in src/builder.js');
    process.exit(1);
}
content = content.replace(oldCall, newCall);

// 2. Update method signature and implementation of enforceDesignQualityStandards
const oldSig = `    enforceDesignQualityStandards(html) {`;
const newSig = `    enforceDesignQualityStandards(html, slug = '', businessName = '') {`;

if (!content.includes(oldSig)) {
    console.error('Could not find oldSig in src/builder.js');
    process.exit(1);
}
content = content.replace(oldSig, newSig);

// 3. Add Rule 9 to enforceDesignQualityStandards right before return html;
const targetReturn = `        // E. Sanitize any accidental embedded credentials or API keys in code
        html = html.replace(/(?:vcp_[a-zA-Z0-9_-]{20,}|AIzaSy[a-zA-Z0-9_-]{20,}|sk-or-v1-[a-zA-Z0-9_-]{20,})/g, '[REDACTED]');

        return html;`;

const newReturn = `        // E. Sanitize any accidental embedded credentials or API keys in code
        html = html.replace(/(?:vcp_[a-zA-Z0-9_-]{20,}|AIzaSy[a-zA-Z0-9_-]{20,}|sk-or-v1-[a-zA-Z0-9_-]{20,})/g, '[REDACTED]');

        // 9. Universal Asset Normalization & Triple-Tier Image Fallbacks
        const defaultStockPhotos = {
            gym: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80',
            restaurant: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
            cafe: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1200&q=80',
            clinic: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=1200&q=80',
            dental: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=1200&q=80',
            salon: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80',
            general: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80'
        };

        const lower = (html + ' ' + (businessName || '')).toLowerCase();
        let nicheFallback = defaultStockPhotos.general;
        if (lower.includes('gym') || lower.includes('fitness') || lower.includes('crossfit')) nicheFallback = defaultStockPhotos.gym;
        else if (lower.includes('dental')) nicheFallback = defaultStockPhotos.dental;
        else if (lower.includes('clinic') || lower.includes('hospital') || lower.includes('doctor')) nicheFallback = defaultStockPhotos.clinic;
        else if (lower.includes('cafe')) nicheFallback = defaultStockPhotos.cafe;
        else if (lower.includes('restaurant') || lower.includes('dine') || lower.includes('dhaba') || lower.includes('bhojnalaya') || lower.includes('food')) nicheFallback = defaultStockPhotos.restaurant;
        else if (lower.includes('salon') || lower.includes('parlour') || lower.includes('spa')) nicheFallback = defaultStockPhotos.salon;

        // A. Inject base tag and global image error recovery script
        if (slug) {
            const baseTag = \`\\n    <base href="/sites/\${slug}/">\\n    <script>
      window.addEventListener('error', function(e) {
        if (e.target && e.target.tagName === 'IMG') {
          var img = e.target;
          if (!img.dataset.hasFallenBack) {
            img.dataset.hasFallenBack = 'true';
            var src = img.getAttribute('src') || '';
            if (src.includes('assets/')) {
              var fName = src.split('assets/').pop();
              img.src = '/sites/\${slug}/assets/' + fName;
              return;
            }
            img.src = '\${nicheFallback}';
          }
        }
      }, true);
    </script>\`;
            if (!html.includes('<base href=') && html.includes('<head>')) {
                html = html.replace('<head>', \`<head>\${baseTag}\`);
            }
        }

        // B. Ensure all local ./assets/ images are rewritten to /sites/\${slug}/assets/ AND have onerror fallback
        if (slug) {
            html = html.replace(/src=["'](?:\\.\\/)?assets\\/([^"']+)["']/gi, (m, filename) => {
                return \`src="/sites/\${slug}/assets/\${filename}" onerror="this.onerror=null; this.src='\${nicheFallback}';"\`;
            });
        }

        return html;`;

if (!content.includes(targetReturn)) {
    console.error('Could not find targetReturn in src/builder.js');
    process.exit(1);
}
content = content.replace(targetReturn, newReturn);

if (isCrlf) {
    content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(builderPath, content, 'utf8');
console.log('✅ Successfully enhanced enforceDesignQualityStandards in src/builder.js!');

