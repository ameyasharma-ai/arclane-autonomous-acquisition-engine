import fs from 'fs';
import path from 'path';

const planDir = path.join(process.cwd(), 'plan');
const files = fs.readdirSync(planDir);

let jsonUpdated = 0;
let htmlUpdated = 0;

for (const f of files) {
    const fullPath = path.join(planDir, f);
    if (f.endsWith('.json')) {
        let content = fs.readFileSync(fullPath, 'utf8');
        let changed = false;
        if (content.includes('22:15') || content.includes('23:15')) {
            content = content.replace(/"dailyScrapeTime":\s*"22:15"/g, '"dailyScrapeTime": "06:00"');
            content = content.replace(/"cronTime":\s*"22:15"/g, '"cronTime": "06:00"');
            content = content.replace(/"cronTime":\s*"23:15"/g, '"cronTime": "07:30"');
            changed = true;
        }
        if (changed) {
            fs.writeFileSync(fullPath, content, 'utf8');
            jsonUpdated++;
        }
    } else if (f.endsWith('.html')) {
        let content = fs.readFileSync(fullPath, 'utf8');
        let changed = false;
        if (content.includes('10:15 PM') || content.includes('11:15 PM') || content.includes('10:15')) {
            content = content.replace(/10:15 PM/g, '06:00 AM');
            content = content.replace(/11:15 PM/g, '07:30 AM');
            content = content.replace(/🌙\s*10:15\s*PM/g, '🌅 06:00 AM');
            content = content.replace(/🌙 Night/g, '🌅 Morning');
            content = content.replace(/🌙/g, '🌅');
            changed = true;
        }
        if (changed) {
            fs.writeFileSync(fullPath, content, 'utf8');
            htmlUpdated++;
        }
    }
}
console.log(`Updated ${jsonUpdated} JSON plan files and ${htmlUpdated} HTML plan files to 06:00 AM - 07:30 AM schedule.`);
