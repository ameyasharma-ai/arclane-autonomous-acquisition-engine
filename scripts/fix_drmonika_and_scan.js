/**
 * 1) Check the specific broken image on drmonika and replace it
 * 2) Do a full GET scan of ALL images across ALL sites in web-dev-agency
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WDA_SITES = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites');

// Verified working dental equipment images
const DENTAL_REPLACEMENTS = [
  'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1598256989800-fe5f95da9787?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1571772996211-2f02c9727629?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1609840114035-3c981b782dfe?auto=format&fit=crop&w=800&q=80',
];

function checkUrl(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 8000 }, (res) => {
      const ct = res.headers['content-type'] || '';
      const cl = parseInt(res.headers['content-length'] || '0', 10);
      let body = Buffer.alloc(0);
      res.on('data', chunk => { body = Buffer.concat([body, chunk]); });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          contentType: ct,
          contentLength: cl || body.length,
          isImage: ct.startsWith('image/'),
          actualSize: body.length,
        });
      });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message, isImage: false }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout', isImage: false }); });
  });
}

async function main() {
  // Step 1: Check the specific broken URL on drmonika
  const brokenUrl = 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80';
  console.log('=== Checking the specific broken URL ===');
  const result = await checkUrl(brokenUrl);
  console.log('Result:', JSON.stringify(result, null, 2));

  // If it returns 200 but not an image, or content-length is tiny, it's "broken"
  const isTrulyBroken = !result.isImage || result.actualSize < 1000;
  console.log('Is truly broken (not a real image)?', isTrulyBroken);

  // Step 2: Fix drmonika regardless - replace with a confirmed working image
  const drmonikaFile = path.join(WDA_SITES, 'drmonika', 'index.html');
  if (fs.existsSync(drmonikaFile)) {
    let html = fs.readFileSync(drmonikaFile, 'utf8');
    const photoId = '1629909613654-28e377c37b09';
    if (html.includes(photoId)) {
      // Replace with verified dental image
      const replacement = DENTAL_REPLACEMENTS[0];
      html = html.replace(
        new RegExp(`https://images\\.unsplash\\.com/photo-${photoId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"'\\s]*`, 'g'),
        replacement
      );
      fs.writeFileSync(drmonikaFile, html, 'utf8');
      console.log(`✅ Fixed drmonika: replaced photo ${photoId} with ${replacement}`);
    } else {
      console.log('ℹ️ drmonika does not contain this photo ID (already fixed?)');
    }
  }

  // Also check the other drmonika directory
  const drmonikaAlt = path.join(WDA_SITES, 'dr-monika-multispeciality-dental-clinic', 'index.html');
  if (fs.existsSync(drmonikaAlt)) {
    let html = fs.readFileSync(drmonikaAlt, 'utf8');
    const photoId = '1629909613654-28e377c37b09';
    if (html.includes(photoId)) {
      const replacement = DENTAL_REPLACEMENTS[0];
      html = html.replace(
        new RegExp(`https://images\\.unsplash\\.com/photo-${photoId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"'\\s]*`, 'g'),
        replacement
      );
      fs.writeFileSync(drmonikaAlt, html, 'utf8');
      console.log(`✅ Fixed dr-monika-multispeciality-dental-clinic too`);
    }
  }

  // Step 3: Full scan of ALL sites for broken images
  console.log('\n=== Full scan of ALL web-dev-agency sites for broken images ===');
  const dirs = fs.readdirSync(WDA_SITES).filter(d => {
    try { return fs.statSync(path.join(WDA_SITES, d)).isDirectory(); } catch { return false; }
  });
  console.log(`Found ${dirs.length} site directories`);

  const allBroken = [];
  let scanned = 0;
  const imgRegex = /https:\/\/images\.unsplash\.com\/photo-[^"'\s)]+/g;

  for (const dir of dirs) {
    const htmlFile = path.join(WDA_SITES, dir, 'index.html');
    if (!fs.existsSync(htmlFile)) continue;

    const html = fs.readFileSync(htmlFile, 'utf8');
    const urls = [...new Set(html.match(imgRegex) || [])];

    for (const url of urls) {
      const check = await checkUrl(url);
      if (!check.isImage || check.actualSize < 1000) {
        allBroken.push({ site: dir, url, ...check });
        console.log(`❌ BROKEN in ${dir}: ${url} (status=${check.status}, type=${check.contentType}, size=${check.actualSize})`);
      }
    }

    scanned++;
    if (scanned % 50 === 0) console.log(`... scanned ${scanned}/${dirs.length} sites`);
  }

  console.log(`\n=== SCAN COMPLETE ===`);
  console.log(`Total sites scanned: ${scanned}`);
  console.log(`Total broken images found: ${allBroken.length}`);

  if (allBroken.length > 0) {
    fs.writeFileSync(
      path.join(__dirname, '..', 'data_exports', 'remaining_broken_images.json'),
      JSON.stringify(allBroken, null, 2),
      'utf8'
    );
    console.log('Saved to data_exports/remaining_broken_images.json');

    // Group by photo ID
    const byPhotoId = {};
    for (const b of allBroken) {
      const m = b.url.match(/photo-([a-zA-Z0-9_-]+)/);
      const id = m ? m[1] : 'unknown';
      if (!byPhotoId[id]) byPhotoId[id] = [];
      byPhotoId[id].push(b.site);
    }
    console.log('\nBroken by photo ID:');
    for (const [id, sites] of Object.entries(byPhotoId)) {
      console.log(`  ${id}: ${sites.length} sites`);
    }
  }
}

main().catch(console.error);
