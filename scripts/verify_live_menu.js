import https from 'https';

https.get('https://www.arclanestudios.space/sites/lafumee', res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const re = /image:\s*"([^"]+)"/g;
    let match;
    console.log('Live Menu Images on Vercel:');
    while ((match = re.exec(data)) !== null) {
      console.log(match[1]);
    }
  });
});

