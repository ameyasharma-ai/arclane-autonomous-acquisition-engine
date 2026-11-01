/**
 * Autonomous Google Maps Photo Crawler for Arclane Engine
 * Takes a business name, address, or Google Maps URL, opens Playwright in stealth mode,
 * and extracts all candidate high-resolution photos.
 */
import { chromium } from 'playwright';
import path from 'path';
import { mapsPhotoPipeline } from './maps_photo_pipeline.js';

export class MapsPhotoCrawler {
    constructor() {
        this.browser = null;
    }

    async init() {
        if (!this.browser) {
            const launchOptions = {
                headless: true,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-infobars'
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
            await this.browser.close();
            this.browser = null;
        }
    }

    /**
     * Fetch photos for a business by its Maps URL or search query
     */
    async fetchPhotosForBusiness(businessName, mapsUrl = null, address = '') {
        await this.init();
        const context = await this.browser.newContext({
            viewport: { width: 1280, height: 800 },
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

            await page.waitForTimeout(3000);

            // If it's a search results page (not direct place), click first listing if present
            const firstResult = await page.$('a[href*="https://www.google.com/maps/place/"]');
            if (firstResult && page.url().includes('/search/')) {
                console.log(`[MapsPhotoCrawler] Search result list detected, clicking top place card...`);
                try {
                    await firstResult.click();
                    await page.waitForTimeout(3500);
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
                        const galleryUrls = await mapsPhotoPipeline.extractCandidatePhotosFromPage(page);
                        candidateUrls = [...new Set([...candidateUrls, ...galleryUrls])];
                    } catch (e) {}
                }
            }

            console.log(`[MapsPhotoCrawler] 📸 Extracted ${candidateUrls.length} authentic photo URLs for "${businessName}"`);
            await context.close();
            return candidateUrls;
        } catch (err) {
            console.error(`[MapsPhotoCrawler] Error crawling photos for "${businessName}":`, err.message);
            await context.close();
            return [];
        }
    }
}

export const mapsPhotoCrawler = new MapsPhotoCrawler();

