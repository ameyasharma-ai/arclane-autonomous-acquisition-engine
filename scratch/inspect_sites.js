import fs from 'fs';
import path from 'path';

const sitesDir = path.join(process.cwd(), 'generated_sites');
const folders = fs.readdirSync(sitesDir).filter(f => fs.statSync(path.join(sitesDir, f)).isDirectory());

console.log('Total sites:', folders.length);
for (const f of folders) {
    const htmlPath = path.join(sitesDir, f, 'index.html');
    if (fs.existsSync(htmlPath)) {
        const content = fs.readFileSync(htmlPath, 'utf-8');
        const headerMatch = content.match(/<header[^>]*>/i);
        const mobileMenuMatch = content.match(/<div[^>]*id=['"]mobile-menu['"][^>]*>/i);
        console.log(`--- Site: ${f} ---`);
        console.log(`  Header: ${headerMatch ? headerMatch[0] : 'N/A'}`);
        console.log(`  Mobile Menu: ${mobileMenuMatch ? mobileMenuMatch[0] : 'N/A'}`);
    }
}
