const https = require('https');

function checkSite(slug) {
  return new Promise((resolve) => {
    https.get(`https://www.arclanestudios.space/sites/${slug}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const hasCredit = data.includes('arclane-agency-credit') && data.includes('ArcLane Studios');
        const hasOg = data.includes('property="og:title"');
        const hasFixedAnchor = !data.includes('href="#gallery"') || data.includes('id="gallery"');
        resolve({
          slug,
          status: res.statusCode,
          hasCredit,
          hasOg,
          hasFixedAnchor,
          len: data.length
        });
      });
    }).on('error', (err) => {
      resolve({ slug, error: err.message });
    });
  });
}

async function run() {
  const sampleSlugs = [
    'fitnation',
    'bakenbitebliss',
    'crossfitpatna',
    'cafebuddys-patna',
    'cultfraser'
  ];

  console.log('Testing live sample sites for Agency Courtesy Credit & OG tags:');
  for (const slug of sampleSlugs) {
    const res = await checkSite(slug);
    console.log(JSON.stringify(res, null, 2));
  }
}

run();
