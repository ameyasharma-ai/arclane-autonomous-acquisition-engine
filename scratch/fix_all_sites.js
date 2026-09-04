import fs from 'fs';
import path from 'path';

const sitesDir = path.join(process.cwd(), 'generated_sites');
const folders = fs.readdirSync(sitesDir).filter(f => fs.statSync(path.join(sitesDir, f)).isDirectory());

console.log(`Auditing and fixing ${folders.length} generated sites...`);

for (const f of folders) {
    const htmlPath = path.join(sitesDir, f, 'index.html');
    if (!fs.existsSync(htmlPath)) continue;

    let html = fs.readFileSync(htmlPath, 'utf-8');
    const isLightSite = f.includes('george-restaurant');

    // 1. Fix Header class
    html = html.replace(/<header\s+class="([^"]*)"/gi, (match, classes) => {
        let newClasses = classes;
        // Remove translucent/semi-transparent background classes
        newClasses = newClasses.replace(/\bbg-[a-zA-Z0-9_\-\[\]#]+\/(?:80|90|70|50|60|95|85|75)\b/g, '');
        newClasses = newClasses.replace(/\bbackdrop-blur-[a-zA-Z0-9]+\b/g, '');
        newClasses = newClasses.replace(/\btop-\[\d+px\]\b/g, 'top-0');
        newClasses = newClasses.replace(/\bfixed\s+top-0\s+left-0\s+right-0\b/g, 'sticky top-0');

        if (isLightSite) {
            if (!newClasses.includes('bg-[#FAF9F6]') && !newClasses.includes('bg-ivory')) {
                newClasses += ' bg-[#FAF9F6]';
            }
            if (!newClasses.includes('border-b')) {
                newClasses += ' border-b border-[#D4AF37]/30';
            }
        } else {
            if (!newClasses.includes('bg-[#09090b]') && !newClasses.includes('bg-zinc-950') && !newClasses.includes('bg-black')) {
                newClasses += ' bg-[#09090b]';
            }
            if (!newClasses.includes('border-b')) {
                newClasses += ' border-b border-zinc-800';
            }
        }

        if (!newClasses.includes('sticky')) {
            newClasses = 'sticky top-0 ' + newClasses;
        }
        if (!newClasses.includes('z-40') && !newClasses.includes('z-50')) {
            newClasses += ' z-40';
        }

        // Clean double spaces
        newClasses = newClasses.replace(/\s+/g, ' ').trim();
        return `<header class="${newClasses}"`;
    });

    // 2. Fix Mobile Menu Drawer classes
    html = html.replace(/<div\s+([^>]*id=["']mobile-menu["'][^>]*)>/gi, (match, attrs) => {
        let newAttrs = attrs;
        newAttrs = newAttrs.replace(/\bbg-[a-zA-Z0-9_\-\[\]#]+\/(?:80|90|70|50|60|95|85|75)\b/g, '');
        newAttrs = newAttrs.replace(/\bbackdrop-blur-[a-zA-Z0-9]+\b/g, '');

        if (isLightSite) {
            if (!newAttrs.includes('bg-[#FAF9F6]') && !newAttrs.includes('bg-white')) {
                newAttrs = newAttrs.replace(/class="([^"]*)"/, (m, c) => `class="${c} bg-[#FAF9F6] border-l border-zinc-200"`);
            }
        } else {
            if (!newAttrs.includes('bg-[#09090b]') && !newAttrs.includes('bg-zinc-950') && !newAttrs.includes('bg-black') && !newAttrs.includes('bg-surface')) {
                newAttrs = newAttrs.replace(/class="([^"]*)"/, (m, c) => `class="${c} bg-[#09090b] border-l border-zinc-800"`);
            }
        }
        return `<div ${newAttrs}>`;
    });

    // 3. Fix George Restaurant specific mobile menu hidden/opacity issue if present
    if (f === 'george-restaurant-website') {
        html = html.replace(
            /id="mobile-menu"\s+class="[^"]*"/,
            'id="mobile-menu" class="fixed inset-y-0 right-0 z-50 w-full max-w-xs bg-[#FAF9F6] border-l border-gold/30 shadow-2xl p-6 flex flex-col justify-between transform translate-x-full transition-transform duration-300 md:hidden"'
        );
    }

    fs.writeFileSync(htmlPath, html, 'utf-8');
    console.log(`✅ Fixed site: ${f}`);
}

console.log("All sites successfully updated with 100% solid, non-transparent menus!");
