import https from 'https';

function check(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          url,
          status: res.statusCode,
          location: res.headers.location,
          server: res.headers['server'],
          xVercelId: res.headers['x-vercel-id'],
          match: data.match(/<img[^>]+alt="Advanced Dental Equipment"[^>]*>/i)?.[0]
        });
      });
    });
  });
}

async function run() {
  console.log(await check('https://arclanestudios.space/sites/drmonika'));
  console.log(await check('https://www.arclanestudios.space/sites/drmonika'));
}
run();
