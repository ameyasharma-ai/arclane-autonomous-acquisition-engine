import https from 'https';

https.get('https://www.arclanestudios.space/sites/lafumee', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('Live Status:', res.statusCode);
    console.log('Has base tag:', data.includes('<base href="/sites/lafumee/">'));
    console.log('Has fallback listener:', data.includes('hasFallenBack'));
    const heroMatch = data.match(/<img[^>]+hero\.jpg[^>]*>/i);
    console.log('Hero tag:', heroMatch ? heroMatch[0] : 'None');
  });
});

