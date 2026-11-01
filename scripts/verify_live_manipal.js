import https from 'https';

function check(url) {
  return new Promise(resolve => {
    https.get(url, res => {
      console.log(url.slice(34), '-> Status:', res.statusCode, res.headers['content-type'], res.headers['content-length'] || '');
      resolve();
    }).on('error', e => {
      console.log(url.slice(34), '-> Error:', e.message);
      resolve();
    });
  });
}

async function run() {
  await check('https://www.arclanestudios.space/sites/manipal');
  await check('https://www.arclanestudios.space/sites/manipaldental');
  await check('https://www.arclanestudios.space/sites/manipal/assets/hero.jpg');
  await check('https://www.arclanestudios.space/sites/manipaldental/assets/hero.jpg');
}
run();

