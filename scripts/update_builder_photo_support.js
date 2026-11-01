import fs from 'fs';
import path from 'path';

const builderPath = path.join(process.cwd(), 'src', 'builder.js');
let content = fs.readFileSync(builderPath, 'utf8');

const target = "await this.sendStatus(`🚀 *[1/4] Generating Website Code for ${businessName}...*\\nUsing Antigravity Prompt from reports/${clientId}`);";

const photoSnippet = `// Check for authentic Google Maps photos manifest
        const photosManifestPath = path.join(clientReportsDir, 'photos_manifest.json');
        let hasAuthenticPhotos = false;
        if (fs.existsSync(photosManifestPath)) {
            try {
                const pManifest = JSON.parse(fs.readFileSync(photosManifestPath, 'utf8'));
                if (pManifest && pManifest.hasRealPhotos) {
                    hasAuthenticPhotos = true;
                    let photoInstructions = "\\n\\n## 📸 CRITICAL MANDATE: EMBED AUTHENTIC BUSINESS PHOTOGRAPHY (DO NOT USE STOCK URLS)\\n" +
                        "We have extracted and downloaded real, high-resolution photographs of this business directly from their Google Maps profile into the local './assets/' directory.\\n" +
                        "You MUST integrate these real images into the website using their exact relative paths:\\n";

                    if (pManifest.hero && pManifest.hero.src) {
                        photoInstructions += "- HERO SECTION BANNER: Use '<img src=\\"" + pManifest.hero.src + "\\" alt=\\"" + (pManifest.hero.description || businessName) + "\\" class=\\"w-full h-full object-cover\\">' as the main hero background or visual focus.\\n";
                    }
                    if (Array.isArray(pManifest.featured) && pManifest.featured.length > 0) {
                        photoInstructions += "- FEATURED SERVICES / SIGNATURE HIGHLIGHTS:\\n";
                        pManifest.featured.forEach((f, idx) => {
                            photoInstructions += "  * Service Card " + (idx + 1) + ": '<img src=\\"" + f.src + "\\" alt=\\"" + (f.description || 'Featured highlight') + "\\" class=\\"w-full h-48 sm:h-56 object-cover rounded-xl mb-4\\">'\\n";
                        });
                    }
                    if (Array.isArray(pManifest.gallery) && pManifest.gallery.length > 0) {
                        photoInstructions += "- AUTHENTIC GALLERY / FACILITY SHOWCASE:\\n";
                        pManifest.gallery.forEach((g, idx) => {
                            photoInstructions += "  * Gallery Card " + (idx + 1) + ": '<img src=\\"" + g.src + "\\" alt=\\"" + (g.description || 'Facility interior') + "\\" class=\\"w-full h-64 object-cover rounded-2xl\\">'\\n";
                        });
                    }
                    photoInstructions += "\\nSTRICT INSTRUCTION: Use these exact relative paths ('./assets/...'). Do NOT replace these with Unsplash URLs or placeholder images.\\n";

                    antigravityPrompt += photoInstructions;
                    console.log("[Builder] 📸 Injected authentic Google Maps photo instructions for " + businessName + "!");
                }
            } catch (e) {
                console.warn('[Builder] Photos manifest read error:', e.message);
            }
        }

        `;

if (content.includes(target)) {
    content = content.replace(target, photoSnippet + target);
    fs.writeFileSync(builderPath, content, 'utf8');
    console.log('✅ Successfully injected photo manifest support into src/builder.js');
} else {
    console.error('❌ Target string not found in src/builder.js');
}
