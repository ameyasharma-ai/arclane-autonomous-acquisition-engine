import https from 'https';

const urls = [
  'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1598256989800-fe5f95da9787?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1571772996211-2f02c9727629?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1609840114035-3c981b782dfe?auto=format&fit=crop&w=800&q=80'
];

async function main() {
  for (const u of urls) {
    await new Promise(r => {
      https.get(u, res => {
        console.log(u.substring(34, 55), 'Status:', res.statusCode, 'Type:', res.headers['content-type'], 'Size:', res.headers['content-length']);
        r();
      }).on('error', e => {
        console.log('Error:', e.message);
        r();
      });
    });
  }
}
main();

