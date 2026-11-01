/**
 * Maps Photo Pipeline for Arclane Studios
 * Extracts real photos from Google Maps listings, classifies and filters them
 * using Gemini Vision, and downloads high-resolution assets for website builds.
 */
import https from 'https';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MapsPhotoPipeline {
    constructor() {
        this.geminiClient = null;
        if (process.env.API) {
            this.geminiClient = new OpenAI({
                baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
                apiKey: process.env.API,
            });
        }
    }

    /**
     * Clean and upscale a Google User Content photo URL to high resolution (1200x800).
     */
    toHighResUrl(url) {
        if (!url) return '';
        // If it has sizing parameters like =w408-h256-k-no or =w300-h450-p-k-no or =s100
        if (/=w\d+.*$/.test(url)) {
            return url.replace(/=w\d+.*$/, '=w1200-h800-p-k-no');
        }
        if (/=s\d+.*$/.test(url)) {
            return url.replace(/=s\d+.*$/, '=s1200');
        }
        return url;
    }

    /**
     * Extract candidate photo URLs from an active Playwright page on Google Maps.
     */
    async extractCandidatePhotosFromPage(page) {
        try {
            const rawUrls = await page.evaluate(() => {
                const results = new Set();

                // 1. All images on page
                const imgs = document.querySelectorAll('img');
                for (const img of imgs) {
                    const src = img.src || img.getAttribute('src') || '';
                    if (!src) continue;

                    // Must be a Google Maps CDN photo
                    const isGoogleCdn = src.includes('googleusercontent.com') || src.includes('ggpht.com');
                    if (!isGoogleCdn) continue;

                    // Filter out reviewer avatars, icons, badges
                    const isAvatar = src.includes('/a-/') || src.includes('/a/') || 
                                     src.includes('profile-photo') || src.includes('silhouette') ||
                                     src.includes('photo-round') || src.includes('w36-h36') ||
                                     src.includes('w24-h24') || src.includes('w48-h48');
                    if (isAvatar) continue;

                    // Filter out UI sprite icons
                    if (src.includes('icon') || src.includes('sprite') || src.includes('maps/vt/')) continue;

                    results.add(src);
                }

                // 2. Background images
                const styledElems = document.querySelectorAll('[style*="background"]');
                for (const el of styledElems) {
                    const bg = el.style.backgroundImage || window.getComputedStyle(el).backgroundImage || '';
                    const match = bg.match(/url\(["']?(https:[^"')]+)["']?\)/);
                    if (match && (match[1].includes('googleusercontent.com') || match[1].includes('ggpht.com'))) {
                        const src = match[1];
                        if (!src.includes('/a-/') && !src.includes('profile')) {
                            results.add(src);
                        }
                    }
                }

                return Array.from(results);
            });

            // Normalize each candidate to high-res
            const highResUrls = [...new Set(rawUrls.map(u => this.toHighResUrl(u)).filter(Boolean))];
            return highResUrls.slice(0, 10);
        } catch (err) {
            console.error('[MapsPhotoPipeline] Error extracting candidate photos:', err.message);
            return [];
        }
    }

    /**
     * Use Gemini Vision to classify candidate photos into hero, service/dish, gallery, or discard.
     */
    async classifyPhotos(candidateUrls, businessName = 'Local Business', industry = 'Commercial') {
        if (!this.geminiClient || !candidateUrls || candidateUrls.length === 0) {
            return this.fallbackSelection(candidateUrls);
        }

        console.log(`[MapsPhotoPipeline] 🧠 Classifying ${candidateUrls.length} candidate photos with Gemini Vision for "${businessName}"...`);

        const validCandidates = candidateUrls.slice(0, 6);
        const imageContents = validCandidates.map((url, idx) => ([
            { type: "text", text: `--- Image #${idx + 1} ---` },
            { type: "image_url", image_url: { url } }
        ])).flat();

        const promptText = `
You are an expert art director and web designer. Analyze these ${validCandidates.length} real Google Maps photos for "${businessName}" (${industry}).
Categorize each image for a premium, conversion-optimized commercial website.

Return ONLY a valid JSON object matching this schema:
{
  "classifications": [
    {
      "index": 1,
      "category": "hero" | "featured" | "gallery" | "discard",
      "description": "5-word description of what is shown",
      "qualityScore": 1 to 10,
      "reason": "Why this works for the website or why it is discarded"
    }
  ],
  "bestHeroIndex": <1-based index of the best wide, inviting shot for the Hero banner>,
  "bestFeaturedIndices": [<array of indices for signature products, dishes, equipment, or treatments>],
  "bestGalleryIndices": [<array of indices for ambiance, facilities, and interior shots>]
}

Rules:
- Mark as "discard" if the photo is a blurry selfie, receipt, bathroom, poorly lit clutter, or off-topic.
- "hero" must be clean, spacious, wide, and showcase the storefront, dining area, gym floor, or main facility.
- Do NOT output markdown fences or commentary outside the JSON.
`;

        try {
            const response = await this.geminiClient.chat.completions.create({
                model: "gemini-flash-lite-latest",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: promptText },
                            ...imageContents
                        ]
                    }
                ],
                temperature: 0.2
            });

            const content = response.choices[0].message.content.trim();
            const cleanJson = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
            const parsed = JSON.parse(cleanJson);

            const result = {
                hero: null,
                featured: [],
                gallery: [],
                discarded: []
            };

            // Map indices back to URLs
            if (parsed.bestHeroIndex && validCandidates[parsed.bestHeroIndex - 1]) {
                const heroClass = parsed.classifications?.find(c => c.index === parsed.bestHeroIndex);
                result.hero = {
                    url: validCandidates[parsed.bestHeroIndex - 1],
                    description: heroClass?.description || 'Main entrance and atmosphere'
                };
            } else if (validCandidates.length > 0) {
                result.hero = { url: validCandidates[0], description: 'Main atmosphere' };
            }

            if (Array.isArray(parsed.bestFeaturedIndices)) {
                for (const idx of parsed.bestFeaturedIndices) {
                    if (validCandidates[idx - 1] && validCandidates[idx - 1] !== result.hero?.url) {
                        const c = parsed.classifications?.find(cl => cl.index === idx);
                        result.featured.push({
                            url: validCandidates[idx - 1],
                            description: c?.description || 'Featured highlight'
                        });
                    }
                }
            }

            if (Array.isArray(parsed.bestGalleryIndices)) {
                for (const idx of parsed.bestGalleryIndices) {
                    if (validCandidates[idx - 1] && validCandidates[idx - 1] !== result.hero?.url) {
                        const c = parsed.classifications?.find(cl => cl.index === idx);
                        result.gallery.push({
                            url: validCandidates[idx - 1],
                            description: c?.description || 'Facility detail'
                        });
                    }
                }
            }

            // Fill empty gallery slots with any remaining non-discarded candidates
            for (let i = 0; i < validCandidates.length; i++) {
                const u = validCandidates[i];
                if (u === result.hero?.url) continue;
                if (result.featured.some(f => f.url === u)) continue;
                if (result.gallery.some(g => g.url === u)) continue;
                
                const c = parsed.classifications?.find(cl => cl.index === (i + 1));
                if (c && c.category === 'discard') {
                    result.discarded.push(u);
                } else if (result.gallery.length < 3) {
                    result.gallery.push({ url: u, description: c?.description || 'Authentic photo' });
                }
            }

            console.log(`[MapsPhotoPipeline] ✅ Vision classified: Hero: 1, Featured: ${result.featured.length}, Gallery: ${result.gallery.length}`);
            return result;
        } catch (err) {
            console.warn('[MapsPhotoPipeline] Gemini Vision classification failed, using heuristic fallback:', err.message);
            return this.fallbackSelection(candidateUrls);
        }
    }

    /**
     * Heuristic fallback when AI Vision is unavailable
     */
    fallbackSelection(candidateUrls) {
        if (!candidateUrls || candidateUrls.length === 0) {
            return { hero: null, featured: [], gallery: [], discarded: [] };
        }
        return {
            hero: { url: candidateUrls[0], description: 'Main atmosphere' },
            featured: candidateUrls.slice(1, 3).map((u, i) => ({ url: u, description: `Service highlight ${i + 1}` })),
            gallery: candidateUrls.slice(3, 6).map((u, i) => ({ url: u, description: `Facility detail ${i + 1}` })),
            discarded: []
        };
    }

    /**
     * Download an image to local disk
     */
    downloadImage(url, destPath) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(destPath);
            https.get(url, { timeout: 10000 }, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    // Handle redirect
                    https.get(response.headers.location, { timeout: 10000 }, (res2) => {
                        res2.pipe(file);
                        file.on('finish', () => { file.close(resolve); });
                    }).on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
                    return;
                }
                if (response.statusCode !== 200) {
                    fs.unlink(destPath, () => {});
                    return reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
                }
                response.pipe(file);
                file.on('finish', () => { file.close(resolve); });
            }).on('error', (err) => {
                fs.unlink(destPath, () => {});
                reject(err);
            });
        });
    }

    /**
     * Download classified photos into target directory (e.g. public/sites/<slug>/assets/)
     * Returns an object with local relative paths (e.g. ./assets/hero.jpg)
     */
    async downloadAndStageAssets(classified, targetSiteDir) {
        const assetsDir = path.join(targetSiteDir, 'assets');
        if (!fs.existsSync(assetsDir)) {
            fs.mkdirSync(assetsDir, { recursive: true });
        }

        const stagedManifest = {
            hasRealPhotos: false,
            hero: null,
            featured: [],
            gallery: []
        };

        // 1. Download Hero
        if (classified.hero?.url) {
            try {
                const heroPath = path.join(assetsDir, 'hero.jpg');
                await this.downloadImage(classified.hero.url, heroPath);
                stagedManifest.hero = {
                    src: './assets/hero.jpg',
                    description: classified.hero.description || 'Authentic atmosphere',
                    originalUrl: classified.hero.url
                };
                stagedManifest.hasRealPhotos = true;
                console.log(`[MapsPhotoPipeline] 📥 Downloaded hero photo -> ./assets/hero.jpg`);
            } catch (e) {
                console.warn(`[MapsPhotoPipeline] Could not download hero: ${e.message}`);
            }
        }

        // 2. Download Featured
        if (Array.isArray(classified.featured)) {
            for (let i = 0; i < classified.featured.length; i++) {
                const item = classified.featured[i];
                try {
                    const fname = `featured-${i + 1}.jpg`;
                    const destPath = path.join(assetsDir, fname);
                    await this.downloadImage(item.url, destPath);
                    stagedManifest.featured.push({
                        src: `./assets/${fname}`,
                        description: item.description,
                        originalUrl: item.url
                    });
                    stagedManifest.hasRealPhotos = true;
                    console.log(`[MapsPhotoPipeline] 📥 Downloaded featured photo -> ./assets/${fname}`);
                } catch (e) {
                    console.warn(`[MapsPhotoPipeline] Could not download featured ${i + 1}: ${e.message}`);
                }
            }
        }

        // 3. Download Gallery
        if (Array.isArray(classified.gallery)) {
            for (let i = 0; i < classified.gallery.length; i++) {
                const item = classified.gallery[i];
                try {
                    const fname = `gallery-${i + 1}.jpg`;
                    const destPath = path.join(assetsDir, fname);
                    await this.downloadImage(item.url, destPath);
                    stagedManifest.gallery.push({
                        src: `./assets/${fname}`,
                        description: item.description,
                        originalUrl: item.url
                    });
                    stagedManifest.hasRealPhotos = true;
                    console.log(`[MapsPhotoPipeline] 📥 Downloaded gallery photo -> ./assets/${fname}`);
                } catch (e) {
                    console.warn(`[MapsPhotoPipeline] Could not download gallery ${i + 1}: ${e.message}`);
                }
            }
        }

        // Save manifest in the site assets folder for auditing
        fs.writeFileSync(path.join(assetsDir, 'photos_manifest.json'), JSON.stringify(stagedManifest, null, 2), 'utf8');

        return stagedManifest;
    }
}

export const mapsPhotoPipeline = new MapsPhotoPipeline();

