import { chromium } from 'playwright';
import PQueue from 'p-queue';
import pRetry from 'p-retry';
import path from 'path';
import { compressHtmlToText } from './parser.js';

function extractPhonesFromContent(text) {
    if (!text) return [];
    const found = new Set();

    // 1. Check wa.me / WhatsApp links
    const waMatches = text.matchAll(/(?:wa\.me\/|whatsapp\.com\/send\?phone=|api\.whatsapp\.com\/send\?phone=)(\+?\d{10,15})/gi);
    for (const m of waMatches) {
        let digits = m[1].replace(/\D/g, '');
        if (digits.length === 10) digits = '91' + digits;
        if (digits.length >= 10) found.add('+' + digits);
    }

    // 2. Check tel: links
    const telMatches = text.matchAll(/tel:(\+?\d{10,15})/gi);
    for (const m of telMatches) {
        let digits = m[1].replace(/\D/g, '');
        if (digits.length === 10) digits = '91' + digits;
        if (digits.length >= 10) found.add('+' + digits);
    }

    // 3. Check Indian standard numbers in text (+91 / 0 / 10 digits starting with 6-9)
    const phoneMatches = text.matchAll(/(?:(?:\+|00)91[\s-]?)?(?:0)?[6-9]\d{4}[\s-]?\d{5}/g);
    for (const m of phoneMatches) {
        let digits = m[0].replace(/\D/g, '');
        if (digits.length === 10) digits = '91' + digits;
        else if (digits.length === 11 && digits.startsWith('0')) digits = '91' + digits.substring(1);
        if (digits.length >= 10) found.add('+' + digits);
    }

    return Array.from(found);
}

export class Scraper {
    constructor() {
        this.context = null;
    }

    async init() {
        if (!this.context) {
            // Use launchPersistentContext to save logins (cookies, sessions) between runs.
            // This creates a dedicated 'chrome_profile' folder in the project.
            const userDataDir = path.join(process.cwd(), 'chrome_profile');
            const launchOptions = {
                headless: true,
                channel: 'chrome',
                viewport: { width: 1366, height: 768 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-infobars',
                    '--disable-dev-shm-usage'
                ]
            };
            try {
                this.context = await chromium.launchPersistentContext(userDataDir, launchOptions);
            } catch (err) {
                delete launchOptions.channel;
                this.context = await chromium.launchPersistentContext(userDataDir, launchOptions);
            }
        }
    }

    async close() {
        if (this.context) {
            await this.context.close();
            this.context = null;
        }
    }

    async scrapeLead(leadData) {
        const results = {
            website: {},
            maps: '',
            social: {},
            extractedPhones: []
        };

        const queue = new PQueue({ concurrency: 2 }); // Reduced to 2 to look more human
        const visitedUrls = new Set();

        const safeScrape = async (url, type, name) => {
            if (!url || visitedUrls.has(url)) return;
            visitedUrls.add(url);
            
            await queue.add(async () => {
                const page = await this.context.newPage();
                
                // Mask Webdriver flag to evade bot detection
                await page.addInitScript(() => {
                    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                });

                try {
                    // 1. Human-like hesitation before opening the page
                    await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1000);
                    
                    await pRetry(async () => {
                        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
                    }, { retries: 2 });
                    
                    // 2. Human-like scrolling to trigger lazy loading and evade static bot checks
                    await page.evaluate(async () => {
                        await new Promise((resolve) => {
                            let totalHeight = 0;
                            const distance = 150;
                            const timer = setInterval(() => {
                                const scrollHeight = document.body.scrollHeight;
                                window.scrollBy(0, distance);
                                totalHeight += distance;
                                // Stop if we reach bottom or scroll too far (prevent infinite scroll traps)
                                if (totalHeight >= scrollHeight || totalHeight > 4000) {
                                    clearInterval(timer);
                                    resolve();
                                }
                            }, 150); // Scrolldown every 150ms
                        });
                    });
                    
                    // 3. Final human-like pause to let dynamic content render after scrolling
                    await page.waitForTimeout(Math.floor(Math.random() * 3000) + 1500);

                    const html = await page.content();
                    const textContent = compressHtmlToText(html);
                    
                    if (textContent && textContent.trim().length > 0) {
                        const preview = textContent.substring(0, 60).replace(/\n/g, ' ');
                        console.log(`[Scraper] ✅ Successfully scraped ${type}: ${name || url} | Preview: "${preview}..."`);
                    } else {
                        console.log(`[Scraper] ⚠️ Loaded ${type} (${name || url}) but found no usable text content.`);
                    }

                    // Deep Phone Extraction from HTML & Text (Commented out: only pick data from Maps card)
                    /*
                    const phonesInPage = extractPhonesFromContent(html + '\n' + textContent);
                    for (const p of phonesInPage) {
                        if (!results.extractedPhones.includes(p)) {
                            results.extractedPhones.push(p);
                            console.log(`[Scraper] 📞 Discovered phone/WhatsApp from ${type} (${name || url}): ${p}`);
                        }
                    }
                    */
                    
                    if (type === 'website') {
                        results.website[name || 'homepage'] = textContent;
                    } else if (type === 'maps') {
                        results.maps = textContent;
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

        const url = leadData['Existing Website'] || leadData['Website URL'];
        if (url && url.trim() !== '') {
            safeScrape(url, 'website', 'homepage');
        }

        const socials = ['Instagram', 'Facebook', 'X (Twitter)', 'LinkedIn', 'YouTube', 'TikTok'];
        for (const social of socials) {
            const sUrl = leadData[social];
            if (sUrl && sUrl.trim() !== '') {
                // Handle multiple URLs in the same cell separated by commas
                const urls = sUrl.split(',').map(u => u.trim()).filter(u => u !== '');
                for (let i = 0; i < urls.length; i++) {
                    // Unique name if there are multiple, e.g., 'Instagram_1'
                    const name = urls.length > 1 ? `${social}_${i + 1}` : social;
                    safeScrape(urls[i], 'social', name);
                }
            }
        }

        await queue.onIdle();

        return results;
    }
}
