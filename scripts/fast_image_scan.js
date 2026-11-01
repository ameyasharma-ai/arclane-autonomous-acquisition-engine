/**
 * Fast parallel scan of ALL web-dev-agency sites for broken Unsplash images.
 * Uses HEAD requests with 5s timeout and runs 20 concurrent requests.
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WDA_SITES = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites');

function headCheck(url) {
  return new Promise((resolve) => {
    const opts = new URL(url);
    opts.method = 'HEAD';
    const req = https.request(opts, (res) => {
      const ct = res.headers['content-type'] || '';
      resolve({ status: res.statusCode, contentType: ct, isImage: ct.startsWith('image/') });
      res.resume();
    });
    req.setTimeout(5000, () => { req.destroy(); resolve({ status: 0, error: 'timeout', isImage: false }); });
    req.on('error', (e) => resolve({ status: 0, error: e.message, isImage: false }));
    req.end();
  });
}

async function runBatch(tasks, concurrency) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function main() {
  const dirs = fs.readdirSync(WDA_SITES).filter(d => {
    try { return fs.statSync(path.join(WDA_SITES, d)).isDirectory(); } catch { return false; }
  });
  console.log(`Found ${dirs.length} site directories`);

  // Collect all unique image URLs with their sites
  const imgRegex = /https:\/\/images\.unsplash\.com\/photo-[^"'\s)]+/g;
  const urlToSites = new Map();
  
  for (const dir of dirs) {
    const htmlFile = path.join(WDA_SITES, dir, 'index.html');
    if (!fs.existsSync(htmlFile)) continue;
    const html = fs.readFileSync(htmlFile, 'utf8');
    const urls = [...new Set(html.match(imgRegex) || [])];
    for (const url of urls) {
      if (!urlToSites.has(url)) urlToSites.set(url, []);
      urlToSites.get(url).push(dir);
    }
  }

  const uniqueUrls = [...urlToSites.keys()];
  console.log(`Found ${uniqueUrls.length} unique Unsplash image URLs across all sites`);

  // Batch check all URLs with concurrency
  const broken = [];
  let checked = 0;

  const tasks = uniqueUrls.map((url) => async () => {
    const result = await headCheck(url);
    checked++;
    if (checked % 100 === 0) console.log(`... checked ${checked}/${uniqueUrls.length}`);
    
    // Consider broken if: not 200, not image content type, or error/timeout
    if (result.status !== 200 || !result.isImage) {
      const sites = urlToSites.get(url);
      broken.push({ url, sites, ...result });
    }
    return result;
  });

  await runBatch(tasks, 20);

  console.log(`\n=== SCAN COMPLETE ===`);
  console.log(`Unique URLs checked: ${uniqueUrls.length}`);
  console.log(`Broken URLs: ${broken.length}`);

  if (broken.length > 0) {
    // Group by photo ID
    const byPhotoId = {};
    let totalAffectedSites = 0;
    for (const b of broken) {
      const m = b.url.match(/photo-([a-zA-Z0-9_-]+)/);
      const id = m ? m[1] : 'unknown';
      if (!byPhotoId[id]) byPhotoId[id] = { count: 0, sites: [], status: b.status, error: b.error };
      byPhotoId[id].count += b.sites.length;
      byPhotoId[id].sites.push(...b.sites);
      totalAffectedSites += b.sites.length;
    }
    
    console.log(`\nTotal affected site instances: ${totalAffectedSites}`);
    console.log('\nBroken by photo ID:');
    for (const [id, info] of Object.entries(byPhotoId)) {
      console.log(`  photo-${id}: ${info.count} site(s), status=${info.status}, error=${info.error || 'none'}`);
    }

    fs.writeFileSync(
      path.join(__dirname, '..', 'data_exports', 'remaining_broken_images.json'),
      JSON.stringify(broken, null, 2),
      'utf8'
    );
    console.log('\nSaved detailed report to data_exports/remaining_broken_images.json');
  } else {
    console.log('\n🎉 ALL images are loading correctly! No broken URLs found.');
  }
}

main().catch(console.error);

