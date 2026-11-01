import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SITES_DIR = path.join(__dirname, '..', 'web-dev-agency', 'public', 'sites');

function checkUrl(url) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 7000
      }, (res) => {
        let size = 0;
        res.on('data', chunk => size += chunk.length);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            contentType: res.headers['content-type'],
            size
          });
        });
      });
      req.on('error', e => resolve({ status: 0, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
    } catch (e) {
      resolve({ status: 0, error: e.message });
    }
  });
}

async function scan() {
  const dirs = fs.readdirSync(SITES_DIR);
  const allImages = new Map(); // url -> { sites: [], result: null }

  for (const dir of dirs) {
    const fullDir = path.join(SITES_DIR, dir);
    if (!fs.statSync(fullDir).isDirectory()) continue;
    const htmlPath = path.join(fullDir, 'index.html');
    if (!fs.existsSync(htmlPath)) continue;

    const content = fs.readFileSync(htmlPath, 'utf8');
    const matches = content.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi);
    for (const m of matches) {
      const src = m[1];
      if (src.startsWith('data:') || src.startsWith('/')) continue;
      if (!allImages.has(src)) {
        allImages.set(src, { sites: [dir] });
      } else {
        allImages.get(src).sites.push(dir);
      }
    }
  }

  console.log(`Found ${allImages.size} unique remote image URLs across all deployed sites.`);
  
  const broken = [];
  const entries = Array.from(allImages.entries());
  
  // Test concurrency of 5
  for (let i = 0; i < entries.length; i += 5) {
    const chunk = entries.slice(i, i + 5);
    await Promise.all(chunk.map(async ([url, data]) => {
      const res = await checkUrl(url);
      if (res.status !== 200 || !res.contentType?.startsWith('image/') || res.size < 500) {
        console.log(`❌ BROKEN: ${url} (Status: ${res.status}, Type: ${res.contentType}, Size: ${res.size})`);
        console.log(`   Used in: ${data.sites.join(', ')}`);
        broken.push({ url, res, sites: data.sites });
      }
    }));
  }

  console.log(`\nScan Complete! Broken images found: ${broken.length}`);
  return broken;
}

scan();
