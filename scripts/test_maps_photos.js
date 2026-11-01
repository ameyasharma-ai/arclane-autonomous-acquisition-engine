/**
 * Test extracting photos from a Google Maps listing using Playwright.
 */
import { chromium } from 'playwright';

const testUrl = 'https://www.google.com/maps/place/FITNATION+GYM/data=!4m7!3m6!1s0x39ed598da53b109d:0xd5125e4e799b4157!8m2!3d25.6109372!4d85.1507557!16s%2Fg%2F11q8tx6r69!19sChIJnRA7pY1Z7TkRV0GbeU5eEtU?authuser=0&hl=en&g_ep=EgoyMDI2MTAyMC4wIJJjKgBIAVAD&rclk=1';

async function testExtractPhotos() {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  console.log('Navigating to Google Maps URL...');
  await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait a few seconds for initial DOM
  await page.waitForTimeout(4000);

  // Look for photo buttons or images
  const photoUrls = await page.evaluate(() => {
    const urls = new Set();

    // 1. Check all images with googleusercontent
    const imgs = document.querySelectorAll('img');
    for (const img of imgs) {
      const src = img.src || img.getAttribute('src') || '';
      if (src.includes('googleusercontent.com') || src.includes('ggpht.com')) {
        // Exclude tiny icons, avatars, review avatars
        if (!src.includes('profile-photo') && !src.includes('silhouette') && !src.includes('photo-round')) {
          urls.add(src);
        }
      }
    }

    // 2. Check background images in styles
    const allElems = document.querySelectorAll('*');
    for (const el of allElems) {
      const bg = window.getComputedStyle(el).backgroundImage || '';
      if (bg.includes('googleusercontent.com') || bg.includes('ggpht.com')) {
        const match = bg.match(/url\(["']?(https:[^"')]+)["']?\)/);
        if (match) urls.add(match[1]);
      }
    }

    return Array.from(urls);
  });

  console.log(`Found ${photoUrls.length} candidate photo URLs directly on page:`);
  photoUrls.forEach((u, i) => console.log(`  [${i + 1}] ${u}`));

  // Check if there is a "Photos" tab or button to get more
  const photosButton = await page.$('button[aria-label*="Photo"], button[aria-label*="photo"]');
  if (photosButton) {
    console.log('Found photo tab/button, clicking to view gallery...');
    try {
      await photosButton.click();
      await page.waitForTimeout(3000);

      const galleryUrls = await page.evaluate(() => {
        const urls = new Set();
        const imgs = document.querySelectorAll('img');
        for (const img of imgs) {
          const src = img.src || '';
          if (src.includes('googleusercontent.com') && !src.includes('profile')) {
            urls.add(src);
          }
        }
        return Array.from(urls);
      });
      console.log(`Found ${galleryUrls.length} photos after clicking photo button:`);
      galleryUrls.slice(0, 8).forEach((u, i) => console.log(`  [G${i + 1}] ${u}`));
    } catch (e) {
      console.log('Could not click photo button:', e.message);
    }
  }

  await browser.close();
}

testExtractPhotos().catch(console.error);

