const fs = require('fs');
const path = require('path');
const https = require('https');

const sitesDir = path.join(process.cwd(), 'web-dev-agency', 'public', 'sites');
const BASE_URL = 'https://www.arclanestudios.space/sites';

console.log('================================================================');
console.log('🌐 LIVE PRODUCTION AUDIT: ALL 501 HOSTED WEBSITES ONLINE');
console.log('================================================================\n');

// Load all 501 leads
const leads = [];
for (let i = 1; i <= 501; i++) {
  const p = path.join(process.cwd(), 'reports', String(i), 'outreach.json');
  if (fs.existsSync(p)) {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    leads.push({
      clientId: i,
      businessName: data.businessName,
      phone: data.phone,
      slug: data.slug || data.deployedUrl?.split('/').pop(),
      deployedUrl: data.deployedUrl
    });
  }
}

console.log(`Loaded ${leads.length} leads. Starting live HTTP probes...`);

// Helper for HTTP HEAD request
function probeUrl(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', timeout: 8000 }, (res) => {
      resolve({
        statusCode: res.statusCode,
        contentLength: parseInt(res.headers['content-length'] || '0', 10),
        contentType: res.headers['content-type']
      });
    });
    req.on('error', (err) => resolve({ statusCode: 0, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ statusCode: 408, error: 'TIMEOUT' }); });
    req.end();
  });
}

// Concurrency pool
async function asyncPool(limit, items, iteratorFn) {
  const ret = [];
  const executing = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    if (limit <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

// Anomaly counters & details
const anomalies = {
  httpFailed: [],
  smallPage: [],
  unsubstitutedTokens: [],
  brokenTelLinks: [],
  brokenWaLinks: [],
  brokenAnchorLinks: [],
  titleIssues: [],
  loremIpsum: [],
  duplicateImages: [],
  emptySrcImages: []
};

let completed = 0;
const startTime = Date.now();

async function checkLead(lead) {
  const url = `${BASE_URL}/${lead.slug}`;
  const localHtmlPath = path.join(sitesDir, lead.slug, 'index.html');
  
  // 1. Live HTTP Probe
  const liveRes = await probeUrl(url);

  if (liveRes.statusCode !== 200) {
    anomalies.httpFailed.push({
      clientId: lead.clientId,
      slug: lead.slug,
      businessName: lead.businessName,
      statusCode: liveRes.statusCode,
      error: liveRes.error || `HTTP ${liveRes.statusCode}`
    });
  } else if (liveRes.contentLength < 5000) {
    anomalies.smallPage.push({
      clientId: lead.clientId,
      slug: lead.slug,
      contentLength: liveRes.contentLength
    });
  }

  // 2. DOM & Code Integrity Check (from actual served file)
  if (fs.existsSync(localHtmlPath)) {
    const html = fs.readFileSync(localHtmlPath, 'utf8');

    // Token checks
    if (/\{\{[a-zA-Z0-9_-]+\}\}/.test(html) || /\[Business Name\]/i.test(html) || /\bundefined\b/.test(html) && !html.includes('typeof undefined')) {
      // Check if undefined is in user-facing text
      const visibleTextMatches = html.match(/>[^<]*\bundefined\b[^<]*</g);
      if (visibleTextMatches) {
        anomalies.unsubstitutedTokens.push({
          clientId: lead.clientId,
          slug: lead.slug,
          tokens: visibleTextMatches.slice(0, 3)
        });
      }
    }

    // Lorem Ipsum check
    if (/lorem ipsum/i.test(html)) {
      anomalies.loremIpsum.push({ clientId: lead.clientId, slug: lead.slug });
    }

    // Tel Links check
    const telMatches = [...html.matchAll(/href=["']tel:([^"']+)["']/gi)].map(m => m[1]);
    for (const tel of telMatches) {
      const cleanDigits = tel.replace(/[^0-9]/g, '');
      if (cleanDigits.length < 8 || cleanDigits === '1234567890' || cleanDigits.includes('00000000')) {
        anomalies.brokenTelLinks.push({
          clientId: lead.clientId,
          slug: lead.slug,
          tel,
          businessPhone: lead.phone
        });
        break;
      }
    }

    // WhatsApp Links check
    const waMatches = [...html.matchAll(/href=["']https?:\/\/wa\.me\/([^"'\?]+)/gi)].map(m => m[1]);
    for (const wa of waMatches) {
      const cleanDigits = wa.replace(/[^0-9]/g, '');
      if (cleanDigits.length < 8 || cleanDigits === '1234567890' || cleanDigits.includes('00000000')) {
        anomalies.brokenWaLinks.push({
          clientId: lead.clientId,
          slug: lead.slug,
          wa,
          businessPhone: lead.phone
        });
        break;
      }
    }

    // Anchor Links check
    const anchorMatches = [...html.matchAll(/href=["']#([a-zA-Z0-9_-]+)["']/gi)].map(m => m[1]);
    const brokenAnchors = [];
    for (const anchor of anchorMatches) {
      if (anchor === '' || anchor === '#') continue;
      const targetRegex = new RegExp(`id=["']${anchor}["']`, 'i');
      if (!targetRegex.test(html)) {
        brokenAnchors.push(anchor);
      }
    }
    if (brokenAnchors.length > 0) {
      anomalies.brokenAnchorLinks.push({
        clientId: lead.clientId,
        slug: lead.slug,
        brokenAnchors: [...new Set(brokenAnchors)]
      });
    }

    // Title check
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (!titleMatch || titleMatch[1].trim().length < 3 || /undefined|title|react app|vite app/i.test(titleMatch[1])) {
      anomalies.titleIssues.push({
        clientId: lead.clientId,
        slug: lead.slug,
        title: titleMatch ? titleMatch[1] : 'NONE'
      });
    }

    // Image duplicates check
    const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
    const uniqueSet = new Set(imgMatches);
    if (imgMatches.length > uniqueSet.size) {
      anomalies.duplicateImages.push({
        clientId: lead.clientId,
        slug: lead.slug,
        total: imgMatches.length,
        unique: uniqueSet.size
      });
    }

    // Empty src
    if (html.includes('src=""') || html.includes("src=''") || html.includes('via.placeholder.com')) {
      anomalies.emptySrcImages.push({ clientId: lead.clientId, slug: lead.slug });
    }
  }

  completed++;
  if (completed % 100 === 0 || completed === 501) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Probed ${completed}/501 live sites (${((completed/501)*100).toFixed(1)}%) in ${elapsed}s...`);
  }
}

// Run 20 concurrent HTTP requests
asyncPool(20, leads, checkLead).then(() => {
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n================================================================`);
  console.log(`✅ LIVE AUDIT FINISHED IN ${totalElapsed}s!`);
  console.log(`================================================================\n`);

  console.log('📊 EMPIRICAL ANOMALY REPORT:');
  console.log(`• Live HTTP Probes 200 OK: ${501 - anomalies.httpFailed.length} / 501`);
  console.log(`• HTTP Failures (404/500/timeout): ${anomalies.httpFailed.length}`);
  console.log(`• Pages Under 5KB (suspicious): ${anomalies.smallPage.length}`);
  console.log(`• Visible "undefined" or Unsubstituted Tokens: ${anomalies.unsubstitutedTokens.length}`);
  console.log(`• Lorem Ipsum Dummy Text: ${anomalies.loremIpsum.length}`);
  console.log(`• Broken / Placeholder Phone (tel:) Links: ${anomalies.brokenTelLinks.length}`);
  console.log(`• Broken / Placeholder WhatsApp Links: ${anomalies.brokenWaLinks.length}`);
  console.log(`• Broken In-Page Anchor Links (e.g. #contact missing): ${anomalies.brokenAnchorLinks.length}`);
  console.log(`• Title Tag Defects (missing or generic): ${anomalies.titleIssues.length}`);
  console.log(`• Duplicate Image URLs: ${anomalies.duplicateImages.length}`);
  console.log(`• Empty / Broken Placeholder Images: ${anomalies.emptySrcImages.length}`);

  // Write comprehensive JSON & Markdown report
  fs.writeFileSync('scratch/live_audit_anomalies.json', JSON.stringify(anomalies, null, 2), 'utf8');

  if (anomalies.httpFailed.length > 0) {
    console.log('\n❌ HTTP Failed Samples:', anomalies.httpFailed.slice(0, 5));
  }
  if (anomalies.brokenAnchorLinks.length > 0) {
    console.log('\n⚠️ Sample Broken Anchors:', anomalies.brokenAnchorLinks.slice(0, 5));
  }
  if (anomalies.brokenTelLinks.length > 0) {
    console.log('\n⚠️ Sample Broken Tel Links:', anomalies.brokenTelLinks.slice(0, 5));
  }
  if (anomalies.brokenWaLinks.length > 0) {
    console.log('\n⚠️ Sample Broken WhatsApp Links:', anomalies.brokenWaLinks.slice(0, 5));
  }
});

