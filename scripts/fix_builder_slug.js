import fs from 'fs';
import path from 'path';

const builderPath = path.join(process.cwd(), 'src', 'builder.js');
let raw = fs.readFileSync(builderPath, 'utf8');
const isCrlf = raw.includes('\r\n');
let content = raw.replace(/\r\n/g, '\n');

content = content.replace('const vercelSlug = staged.slug;', '// vercelSlug is already resolved above');

if (isCrlf) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(builderPath, content, 'utf8');
console.log('Fixed double declaration of vercelSlug!');
