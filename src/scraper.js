import { chromium } from 'playwright';
import PQueue from 'p-queue';
import pRetry from 'p-retry';
import { compressHtmlToText } from './parser.js';

export class Scraper {
    constructor() {
        this.browser = null;
    }

    async init() {
        if (!this.browser) {
            this.browser = await chromium.launch({ headless: false });
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    async scrapeLead(leadData) {
        const context = await this.browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        
        const results = {
            website: {},
            maps: '',
            social: {}
        };

        const queue = new PQueue({ concurrency: 3 }); // Max 3 concurrent tabs
        const visitedUrls = new Set();

        const safeScrape = async (url, type, name) => {
            if (!url || visitedUrls.has(url)) return;
            visitedUrls.add(url);
            
            await queue.add(async () => {
                const page = await context.newPage();
                try {
                    await pRetry(async () => {
                        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    }, { retries: 2 });
                    
                    // Simple wait to allow some JS rendering
                    await page.waitForTimeout(2000);
                    const html = await page.content();
                    const textContent = compressHtmlToText(html);
                    
                    if (type === 'website') {
                        results.website[name || 'homepage'] = textContent;
                    } else if (type === 'maps') {
                        results.maps = textContent; // For maps we just grab the text for now
                    } else if (type === 'social') {
                        results.social[name] = textContent;
                    }

                    // For the homepage, try to find About, Services, Contact
                    if (type === 'website' && name === 'homepage') {
                        const links = await page.$$eval('a', as => as.map(a => ({ href: a.href, text: a.innerText.toLowerCase() })));
                        for (const link of links) {
                            if (!link.href || !link.href.startsWith('http')) continue;
                            if (link.href.includes(new URL(url).hostname)) {
                                if (link.text.includes('about') && !results.website['about']) {
                                    safeScrape(link.href, 'website', 'about');
                                } else if (link.text.includes('service') && !results.website['services']) {
                                    safeScrape(link.href, 'website', 'services');
                                } else if (link.text.includes('contact') && !results.website['contact']) {
                                    safeScrape(link.href, 'website', 'contact');
                                } else if (link.text.includes('blog') && !results.website['blog']) {
                                    safeScrape(link.href, 'website', 'blog');
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.log(`Failed to scrape ${url}: ${e.message}`);
                } finally {
                    await page.close();
                }
            });
        };

        const url = leadData['Website URL'];
        if (url && url.trim() !== '') {
            safeScrape(url, 'website', 'homepage');
        }

        const mapsUrl = leadData['Maps URL'];
        if (mapsUrl && mapsUrl.trim() !== '') {
            safeScrape(mapsUrl, 'maps', 'maps');
        }

        const socials = ['Instagram', 'Facebook', 'X (Twitter)', 'LinkedIn'];
        for (const social of socials) {
            const sUrl = leadData[social];
            if (sUrl && sUrl.trim() !== '') {
                safeScrape(sUrl, 'social', social);
            }
        }

        await queue.onIdle();
        await context.close();

        return results;
    }
}
