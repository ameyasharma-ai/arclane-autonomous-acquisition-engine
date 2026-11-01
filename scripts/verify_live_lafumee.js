import { chromium } from 'playwright';

async function verify() {
    console.log('Testing live site: https://www.arclanestudios.space/sites/lafumee ...');
    const browser = await chromium.launch({ headless: true });

    // 1. Desktop Test
    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const desktopPage = await desktopContext.newPage();
    
    // Listen for image errors
    const failedImages = [];
    desktopPage.on('response', res => {
        if (res.request().resourceType() === 'image' && res.status() >= 400) {
            failedImages.push({ url: res.url(), status: res.status() });
        }
    });

    await desktopPage.goto('https://www.arclanestudios.space/sites/lafumee?v=' + Date.now(), { waitUntil: 'networkidle', timeout: 30000 });

    const title = await desktopPage.title();
    console.log('Desktop Title:', title);

    // Check Showcase Card
    const showcaseImg = await desktopPage.$eval('section img', el => ({
        src: el.src,
        alt: el.alt
    })).catch(() => null);
    console.log('Showcase Card Image:', showcaseImg);

    // Check dishes count
    const dishCount = await desktopPage.$$eval('.menu-item', els => els.length);
    console.log('Menu Items Count:', dishCount);

    // Check for any photocopy text or street banner
    const pageText = await desktopPage.innerText('body');
    const hasPhotocopy = /फोटो|copy|banner/i.test(pageText);
    console.log('Has Photocopy / Flex banner text:', hasPhotocopy);

    // 2. Mobile Test (iPhone 16: 393 x 852)
    const mobileContext = await browser.newContext({ viewport: { width: 393, height: 852 } });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto('https://www.arclanestudios.space/sites/lafumee?v=' + Date.now(), { waitUntil: 'networkidle', timeout: 30000 });

    // Check sticky bottom buttons
    const bottomButtons = await mobilePage.$$eval('div.fixed.bottom-0 a, div.fixed.bottom-0 button', els => els.map(e => ({
        text: e.innerText.trim(),
        href: e.href || '',
        classes: e.className
    })));
    console.log('Mobile Bottom Bar Buttons (' + bottomButtons.length + '):', bottomButtons);

    // Check floating cart pill
    const floatingCartText = await mobilePage.$eval('#floating-cart-pill', el => el.innerText.trim()).catch(() => 'Not found');
    console.log('Floating Cart Pill Text:', floatingCartText);

    // Check horizontal scroll
    const scrollWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await mobilePage.evaluate(() => document.documentElement.clientWidth);
    console.log(`Mobile Viewport: clientWidth=${clientWidth}, scrollWidth=${scrollWidth} (Overflow: ${scrollWidth > clientWidth})`);

    console.log('Failed Images count:', failedImages.length);
    if (failedImages.length > 0) {
        console.log('Failed Images:', failedImages);
    }

    await browser.close();
    console.log('✅ Live verification finished!');
}

verify().catch(console.error);
