import fs from 'fs';
import path from 'path';

const sitesDir = path.join(process.cwd(), 'generated_sites');
const folders = fs.readdirSync(sitesDir).filter(f => fs.statSync(path.join(sitesDir, f)).isDirectory());

console.log(`Applying flawless mobile drawer architecture across all ${folders.length} sites...`);

for (const f of folders) {
    const htmlPath = path.join(sitesDir, f, 'index.html');
    if (!fs.existsSync(htmlPath)) continue;

    let html = fs.readFileSync(htmlPath, 'utf-8');
    const isLightSite = f.includes('george-restaurant');
    const bgColor = isLightSite ? 'bg-[#FAF9F6] text-[#1A1A1A] border-[#D4AF37]/30' : 'bg-[#09090b] text-white border-zinc-800';

    // 1. Ensure bottom sticky bar has z-40 (so z-[90] backdrop and z-[100] drawer sit on top of it)
    html = html.replace(/(class="[^"]*fixed\s+bottom-0[^"]*z-)(?:50|40|30|20)([^"]*")/g, '$140$2');

    // 2. Ensure mobile-menu has z-[100], top-11/12 breathing room below banner, and rounded-tl-2xl
    html = html.replace(
        /<div\s+[^>]*id=["']mobile-menu["'][^>]*class=["']([^"']*)["'][^>]*>/gi,
        (match, classes) => {
            let c = classes;
            c = c.replace(/\bz-\d+\b/g, '');
            c = c.replace(/\bz-\[\d+\]\b/g, '');
            c = c.replace(/\bmax-w-[a-zA-Z0-9]+\b/g, 'max-w-xs sm:max-w-sm');
            c = c.replace(/\bbg-[a-zA-Z0-9_\-\[\]#]+(?:\/\d+)?\b/g, '');
            c = `fixed top-11 sm:top-12 bottom-0 right-0 z-[100] w-full max-w-xs sm:max-w-sm ${isLightSite ? 'bg-[#FAF9F6] border-l border-t border-[#D4AF37]/30 text-[#1A1A1A]' : 'bg-[#09090b] border-l border-t border-zinc-800 text-white'} p-6 pt-5 flex flex-col justify-between transform translate-x-full transition-transform duration-300 lg:hidden shadow-2xl overflow-y-auto rounded-tl-2xl`;
            return `<div id="mobile-menu" class="${c}">`;
        }
    );

    // 3. Ensure backdrop overlay exists before or after mobile-menu
    if (!html.includes('id="menu-backdrop"')) {
        const backdropHtml = `\n    <!-- Mobile Menu Backdrop Overlay -->\n    <div id="menu-backdrop" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90] hidden transition-opacity duration-300"></div>\n`;
        html = html.replace(/(<div\s+[^>]*id=["']mobile-menu["'])/i, `${backdropHtml}$1`);
    }

    // 4. Update JavaScript to handle backdrop toggle & body scroll lock
    if (html.includes('mobileMenu') && !html.includes('menuBackdrop')) {
        html = html.replace(
            /const\s+mobileMenu\s*=\s*document\.getElementById\(['"]mobile-menu['"]\);/g,
            `const mobileMenu = document.getElementById('mobile-menu');\n        const menuBackdrop = document.getElementById('menu-backdrop');`
        );

        // Update toggleMenu function
        html = html.replace(
            /function\s+toggleMenu\(\)\s*\{[\s\S]*?\}/,
            `function openMenu() {
            mobileMenu.classList.remove('translate-x-full');
            if (menuBackdrop) menuBackdrop.classList.remove('hidden');
            document.body.classList.add('overflow-hidden');
        }
        function closeMenu() {
            mobileMenu.classList.add('translate-x-full');
            if (menuBackdrop) menuBackdrop.classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
        }
        function toggleMenu() {
            if (mobileMenu.classList.contains('translate-x-full')) {
                openMenu();
            } else {
                closeMenu();
            }
        }`
        );

        // Attach close listener to backdrop
        if (!html.includes("menuBackdrop.addEventListener('click'")) {
            html = html.replace(
                /(mobileLinks\.forEach\(link\s*=>\s*link\.addEventListener\(['"]click['"],\s*(?:toggleMenu|closeMenu)\)\);)/,
                `$1\n        if (menuBackdrop) menuBackdrop.addEventListener('click', closeMenu);\n        if (closeMenuBtn) closeMenuBtn.addEventListener('click', closeMenu);`
            );
        }
    }

    fs.writeFileSync(htmlPath, html, 'utf-8');
    console.log(`✅ Fixed mobile drawer & backdrop for: ${f}`);
}

console.log("All sites successfully upgraded with z-[100] mobile drawer + z-[90] backdrop overlay!");
