import http from 'http';

const command = process.argv.slice(2).join(' ') || '/stream_scrape "Restaurants" "Fraser Road, Patna" "Patna" 18';
console.log('Sending command:', command);
const payload = JSON.stringify({ text: command });

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
