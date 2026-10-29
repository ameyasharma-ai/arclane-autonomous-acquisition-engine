import http from 'http';

const payload = JSON.stringify({
    text: '/stream_scrape "Fitness Studios" "Kankarbagh, Patna" "Patna" 14'
});

const req = http.request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/command',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
}, (res) => {
    let d = '';
    res.on('data', chunk => d += chunk);
    res.on('end', () => {
        console.log('STATUS:', res.statusCode);
        console.log('RESPONSE:', d);
    });
});

req.on('error', (err) => {
    console.error('ERROR:', err.message);
});

req.write(payload);
req.end();

