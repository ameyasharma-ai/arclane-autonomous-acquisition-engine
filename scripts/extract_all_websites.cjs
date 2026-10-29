const fs = require('fs');
const path = require('path');

const transcripts = [
  'C:/Users/Ameya Sharma/.gemini/antigravity/brain/b12bc7ab-3288-4d35-a3c7-e299473843b7/.system_generated/logs/transcript.jsonl',
  'C:/Users/Ameya Sharma/.gemini/antigravity/brain/b12bc7ab-3288-4d35-a3c7-e299473843b7/.system_generated/logs/transcript_full.jsonl'
];

const urls = new Set();
for (const p of transcripts) {
  if (fs.existsSync(p)) {
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    for (const l of lines) {
      const match1 = l.match(/Found valid website \(([^)]+)\)/g);
      if (match1) {
        match1.forEach(m => {
          const u = m.replace('Found valid website (', '').replace(')', '').trim();
          urls.add(u);
        });
      }
      const match2 = l.match(/\[Google Maps\] \| Website\s*\|\s*(https?:\/\/[^\s"'\\<>]+)/g);
      if (match2) {
        match2.forEach(m => {
          const u = m.replace(/\[Google Maps\] \| Website\s*\|\s*/, '').trim();
          urls.add(u);
        });
      }
    }
  }
}

console.log('Unique URLs in transcript:', urls.size);
Array.from(urls).sort().forEach(u => console.log(u));
