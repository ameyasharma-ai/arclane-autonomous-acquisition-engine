import fs from 'fs';
import path from 'path';

const builderPath = path.join(process.cwd(), 'src', 'builder.js');
let code = fs.readFileSync(builderPath, 'utf8');

// 1. Update photoInstructions injection
const oldPhotoInstructionsRegex = /let photoInstructions = "\\n\\n## 📸 CRITICAL MANDATE: EMBED AUTHENTIC BUSINESS PHOTOGRAPHY[\s\S]*?STRICT INSTRUCTION: Use these exact relative paths \('\.\/assets\/\.\.\.'\)\. Do NOT replace these with Unsplash URLs or placeholder images\.\\n";/;

const newPhotoInstructions = `let photoInstructions = "\\n\\n## 📸 CRITICAL MANDATE: EMBED AUTHENTIC BUSINESS PHOTOGRAPHY (DO NOT USE STOCK URLS)\\n" +
                        "We have extracted and downloaded real, high-resolution photographs of this business directly from their Google Maps profile into the local './assets/' directory.\\n" +
                        "You MUST integrate these real images into the website using their exact relative paths:\\n";

                    if (pManifest.hero && pManifest.hero.src && !pManifest.useStockForHero) {
                        photoInstructions += "- HERO SECTION BANNER: Use '<img src=\\"" + pManifest.hero.src + "\\" alt=\\"" + (pManifest.hero.description || businessName) + "\\" class=\\"w-full h-full object-cover\\">' as the main hero background or visual focus.\\n";
                    } else {
                        photoInstructions += "- HERO SECTION BACKDROP: Use a clean, atmospheric ambient gradient or verified 4K architectural interior stock photo for the wide hero backdrop. DO NOT use street hoardings, flex banners, or outdoor vinyl signs with neighboring shop text!\\n";
                    }
                    if (Array.isArray(pManifest.featured) && pManifest.featured.length > 0) {
                        photoInstructions += "- DESKTOP HERO SHOWCASE CARD (RIGHT COLUMN) & SIGNATURE HIGHLIGHTS:\\n" +
                            "  * The desktop split-hero right column Showcase Card MUST embed authentic image '<img src=\\"" + pManifest.featured[0].src + "\\" alt=\\"" + (pManifest.featured[0].description || businessName) + "\\" class=\\"w-full h-72 sm:h-84 lg:h-[400px] object-cover rounded-2xl\\">' in 100% full opacity (NEVER dimmed, washed out, or tinted with black overlays!).\\n";
                        pManifest.featured.forEach((f, idx) => {
                            photoInstructions += "  * Featured Highlight Card " + (idx + 1) + ": '<img src=\\"" + f.src + "\\" alt=\\"" + (f.description || 'Featured highlight') + "\\" class=\\"w-full h-48 sm:h-56 object-cover rounded-xl mb-4\\">'\\n";
                        });
                    }
                    if (Array.isArray(pManifest.gallery) && pManifest.gallery.length > 0) {
                        photoInstructions += "- AUTHENTIC GALLERY / FACILITY SHOWCASE:\\n";
                        pManifest.gallery.forEach((g, idx) => {
                            photoInstructions += "  * Gallery Card " + (idx + 1) + ": '<img src=\\"" + g.src + "\\" alt=\\"" + (g.description || 'Facility interior') + "\\" class=\\"w-full h-64 object-cover rounded-2xl\\">'\\n";
                        });
                    }
                    photoInstructions += "\\nSTRICT INSTRUCTION: Use these exact relative paths ('./assets/...'). Do NOT replace these with Unsplash URLs or placeholder images.\\n";`;

if (oldPhotoInstructionsRegex.test(code)) {
    code = code.replace(oldPhotoInstructionsRegex, newPhotoInstructions);
    console.log('✅ Updated photoInstructions injection');
} else {
    console.warn('⚠️ Could not find oldPhotoInstructionsRegex');
}

// 2. Enhance mobile bottom bar & floating cart in enforceDesignQualityStandards
const oldMobileBarRegex = /\/\/ 2\. Ensure bottom mobile sticky bar has z-40 \(so drawer and backdrop sit cleanly on top\)\r?\n\s*html = html\.replace\(\/\(class="\[\^"\]\*fixed\\s\+bottom-0\[\^"\]\*z-\)\(\?:50\|40\|30\|20\)\(\[\^"\]\*"\)\/g, '\$140\$2'\);/;

const newMobileBarLogic = `// 2. Ensure bottom mobile sticky bar has z-40 and all buttons have whitespace-nowrap
        html = html.replace(/(<div[^>]*class=["'][^"']*fixed\\s+bottom-0[^"']*["'][^>]*>)([\\s\\S]*?)(<\\/div>)/gi, (fullMatch, openTag, content, closeTag) => {
            let updatedOpenTag = openTag.replace(/z-(?:50|40|30|20)/g, 'z-40');
            if (!updatedOpenTag.includes('z-40')) updatedOpenTag = updatedOpenTag.replace(/class=["']/, 'class="z-40 ');

            // Check if there is a cart button in this mobile bottom bar
            const hasCart = /cart/i.test(content) && /<button|<a/i.test(content);
            if (hasCart) {
                // Extract cart button and move it to a floating action pill above the bottom bar
                const cartBtnMatch = content.match(/(<(?:button|a)[^>]*>[\\s\\S]*?cart[\\s\\S]*?<\\/(?:button|a)>)/i);
                if (cartBtnMatch) {
                    const cartBtn = cartBtnMatch[1];
                    const contentWithoutCart = content.replace(cartBtn, '');
                    const floatingCart = \`\\n    <!-- Floating Cart Action Pill (Mobile) -->\\n    <div id="floating-cart-pill" class="md:hidden fixed bottom-20 right-4 z-50 animate-bounce duration-1000">\\n        <button onclick="toggleCartModal ? toggleCartModal() : (document.getElementById('cart-modal') ? document.getElementById('cart-modal').classList.toggle('hidden') : null)" class="bg-amber-500 hover:bg-amber-400 text-black font-extrabold px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 text-sm whitespace-nowrap border-2 border-white/20">\\n            <i data-lucide="shopping-bag" class="w-4 h-4"></i>\\n            <span>Cart (<span id="floating-cart-count">0</span>)</span>\\n        </button>\\n    </div>\\n\`;

                    const cleanContent = contentWithoutCart.replace(/(<(?:button|a)[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, cls, p3) => {
                        let c = cls;
                        if (!c.includes('whitespace-nowrap')) c = \`\${c} whitespace-nowrap\`;
                        return \`\${p1}\${c}\${p3}\`;
                    });

                    return \`\${floatingCart}\${updatedOpenTag}\${cleanContent}\${closeTag}\`;
                }
            }

            const cleanContent = content.replace(/(<(?:button|a)[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, cls, p3) => {
                let c = cls;
                if (!c.includes('whitespace-nowrap')) c = \`\${c} whitespace-nowrap\`;
                return \`\${p1}\${c}\${p3}\`;
            });

            return \`\${updatedOpenTag}\${cleanContent}\${closeTag}\`;
        });`;

if (oldMobileBarRegex.test(code)) {
    code = code.replace(oldMobileBarRegex, newMobileBarLogic);
    console.log('✅ Updated mobile bottom bar & floating cart logic');
} else {
    console.warn('⚠️ Could not find oldMobileBarRegex');
}

// 3. Ensure nicheFallback is industry-precise (food venues NEVER fallback to dental or clinic)
const oldFallbackRegex = /const lower = \(html \+ ' ' \+ \(businessName \|\| ''\)\)\.toLowerCase\(\);[\s\S]*?else if \(lower\.includes\('salon'\) \|\| lower\.includes\('parlour'\) \|\| lower\.includes\('spa'\)\) nicheFallback = defaultStockPhotos\.salon;/;

const newFallbackLogic = `const bName = (businessName || '').toLowerCase();
        const fullText = (html + ' ' + bName).toLowerCase();
        let nicheFallback = defaultStockPhotos.general;

        if (bName.includes('gym') || bName.includes('fitness') || bName.includes('crossfit') || fullText.includes('gym') || fullText.includes('fitness')) {
            nicheFallback = defaultStockPhotos.gym;
        } else if (bName.includes('cafe') || bName.includes('coffee') || bName.includes('tea') || bName.includes('bistro')) {
            nicheFallback = defaultStockPhotos.cafe;
        } else if (bName.includes('restaurant') || bName.includes('dining') || bName.includes('kitchen') || bName.includes('food') || bName.includes('dhaba') || bName.includes('bhojnalaya') || fullText.includes('restaurant') || fullText.includes('curated menu') || fullText.includes('pizzas')) {
            nicheFallback = defaultStockPhotos.food;
        } else if (bName.includes('dental') || fullText.includes('dentist') || fullText.includes('dental clinic')) {
            nicheFallback = defaultStockPhotos.dental;
        } else if (bName.includes('clinic') || bName.includes('hospital') || bName.includes('doctor') || fullText.includes('clinic')) {
            nicheFallback = defaultStockPhotos.clinic;
        } else if (bName.includes('salon') || bName.includes('spa') || bName.includes('parlour') || fullText.includes('salon')) {
            nicheFallback = defaultStockPhotos.salon;
        }`;

if (oldFallbackRegex.test(code)) {
    code = code.replace(oldFallbackRegex, newFallbackLogic);
    console.log('✅ Updated niche fallback selection logic');
} else {
    console.warn('⚠️ Could not find oldFallbackRegex');
}

fs.writeFileSync(builderPath, code, 'utf8');
console.log('🎉 Successfully saved updates to src/builder.js');
