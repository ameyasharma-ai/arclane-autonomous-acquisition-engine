/**
 * Autonomous Google Maps Photo Crawler for Arclane Engine
 * Takes a business name, address, or Google Maps URL, opens Playwright in stealth mode,
 * and extracts all candidate high-resolution photos.
 * 
 * Supports Visual Bot Mode: launches visible browser window on local desktop
 * and captures real-time screenshots to public/crawler_live_view.jpg.
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { mapsPhotoPipeline } from './maps_photo_pipeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', '..', 'public');

export class MapsPhotoCrawler {
    constructor() {
        this.browser = null;
        this.onProgressHook = null;
    }

    setProgressHook(fn) {
        this.onProgressHook = fn;
    }

    async captureLiveSnapshot(page, statusText = '') {
        try {
            if (!fs.existsSync(publicDir)) {
                fs.mkdirSync(publicDir, { recursive: true });
            }
            const snapPath = path.join(publicDir, 'crawler_live_view.jpg');
            await page.screenshot({ path: snapPath, quality: 75, type: 'jpeg' });
            if (this.onProgressHook) {
                this.onProgressHook({ status: statusText, imagePath: '/crawler_live_view.jpg', timestamp: Date.now() });
            }
        } catch (e) {
            // Ignore snapshot errors non-blockingly
        }
    }

    async init() {
        if (!this.browser) {
            // Visual mode is active by default on desktop sessions (HEADLESS=true turns it off for headless servers)
            const isHeadless = process.env.HEADLESS === 'true';
            console.log(`[MapsPhotoCrawler] 🚀 Launching Visual Bot (Mode: ${isHeadless ? 'Headless Background' : '👀 Live Visual Browser Window'})...`);

            const launchOptions = {
                headless: isHeadless,
                slowMo: isHeadless ? 0 : 120, // smooth visual pacing so the user sees real actions
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-infobars',
                    '--window-size=1280,850'
                ]
            };
            try {
                this.browser = await chromium.launch({ ...launchOptions, channel: 'chrome' });
            } catch (e) {
                this.browser = await chromium.launch(launchOptions);
            }
        }
    }

    async close() {
        if (this.browser) {
            try {
                await this.browser.close();
            } catch (e) {}
            this.browser = null;
        }
    }

    /**
     * Fetch photos for a business by its Maps URL or search query
     */
    async fetchPhotosForBusiness(businessName, mapsUrl = null, address = '') {
        await this.init();
        const context = await this.browser.newContext({
            viewport: { width: 1280, height: 850 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        const page = await context.newPage();
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        try {
            let targetUrl = mapsUrl;
            if (!targetUrl) {
                const query = `${businessName} ${address}`.trim();
                targetUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
            }

            console.log(`[MapsPhotoCrawler] 🧭 Opening Maps listing for "${businessName}"...`);
            try {
                await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            } catch (e) {
                console.log(`[MapsPhotoCrawler] Initial load timeout, continuing with current DOM state...`);
            }

            await page.waitForTimeout(2500);
            await this.captureLiveSnapshot(page, `Browsing Google Maps for ${businessName}`);

            // If it's a search results page (not direct place), click first listing if present
            const firstResult = await page.$('a[href*="https://www.google.com/maps/place/"]');
            if (firstResult && page.url().includes('/search/')) {
                console.log(`[MapsPhotoCrawler] Search result list detected, clicking top place card...`);
                try {
                    await firstResult.click();
                    await page.waitForTimeout(3000);
                    await this.captureLiveSnapshot(page, `Opened place card for ${businessName}`);
                } catch (e) {}
            }

            // Extract candidate photos from the overview page
            let candidateUrls = await mapsPhotoPipeline.extractCandidatePhotosFromPage(page);

            // Also check for the "Photos" gallery tab to enrich selection if < 4 photos found
            if (candidateUrls.length < 4) {
                const photosTabBtn = await page.$('button[aria-label*="Photo"], button[aria-label*="photo"], button[jsaction*="heroHeaderImage"]');
                if (photosTabBtn) {
                    try {
                        console.log(`[MapsPhotoCrawler] Clicking photo gallery tab to collect rich media...`);
                        await photosTabBtn.click();
                        await page.waitForTimeout(2500);
                        await this.captureLiveSnapshot(page, `Scanned photo gallery for ${businessName}`);
                        const galleryUrls = await mapsPhotoPipeline.extractCandidatePhotosFromPage(page);
                        candidateUrls = [...new Set([...candidateUrls, ...galleryUrls])];
                    } catch (e) {}
                }
            }

            console.log(`[MapsPhotoCrawler] 📸 Extracted ${candidateUrls.length} authentic photo URLs for "${businessName}"`);
            await this.captureLiveSnapshot(page, `Completed extraction: ${candidateUrls.length} photos found`);
            
            // Brief visual pause before closing so user sees the final state
            if (process.env.HEADLESS !== 'true') {
                await page.waitForTimeout(1500);
            }

            await context.close();
            return candidateUrls;
        } catch (err) {
            console.error(`[MapsPhotoCrawler] Error crawling photos for "${businessName}":`, err.message);
            try { await context.close(); } catch (e) {}
            return [];
        }
    }
}

export const mapsPhotoCrawler = new MapsPhotoCrawler();
