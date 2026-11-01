import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function audit() {
    const browser = await chromium.launch({ headless: true });
    const targetUrl = 'https://www.arclanestudios.space/sites/crossfit';

    console.log(`🔍 Auditing Live Site: ${targetUrl}`);

    // ==========================================
    // 1. DESKTOP VIEWPORT (1920x1080)
    // ==========================================
    console.log('\n--- [1] DESKTOP VIEWPORT (1920x1080) ---');
    const desktopPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await desktopPage.goto(targetUrl, { waitUntil: 'networkidle' });
    await desktopPage.screenshot({ path: 'public/audit_desktop_viewport.png' });
    await desktopPage.screenshot({ path: 'public/audit_desktop_fullpage.png', fullPage: true });

    const desktopFindings = await desktopPage.evaluate(() => {
        const list = [];
        
        // 1. Top Announcement Bar
        const topBar = document.querySelector('body > div:first-child');
        if (topBar) {
            const rect = topBar.getBoundingClientRect();
            list.push({
                element: 'Top Announcement Bar',
                height: Math.round(rect.height) + 'px',
                width: Math.round(rect.width) + 'px',
                isAbnormalHeight: rect.height > 60,
                text: topBar.innerText.replace(/\s+/g, ' ').slice(0, 80)
            });
        }

        // 2. Navigation Header
        const header = document.querySelector('header');
        if (header) {
            const hRect = header.getBoundingClientRect();
            list.push({
                element: 'Header',
                top: Math.round(hRect.top) + 'px',
                height: Math.round(hRect.height) + 'px'
            });
        }

        // 3. Hero Section
        const h1 = document.querySelector('h1');
        if (h1) {
            const h1Rect = h1.getBoundingClientRect();
            list.push({
                element: 'Hero H1',
                height: Math.round(h1Rect.height) + 'px',
                width: Math.round(h1Rect.width) + 'px',
                fontSize: window.getComputedStyle(h1).fontSize,
                overflowing: h1.scrollWidth > h1.clientWidth
            });
        }

        return list;
    });

    console.log('Desktop Layout Structure:', desktopFindings);

    // ==========================================
    // 2. MOBILE VIEWPORT (393x852 - iPhone 16)
    // ==========================================
    console.log('\n--- [2] MOBILE VIEWPORT (393x852 - iPhone 16) ---');
    const mobilePage = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
    await mobilePage.goto(targetUrl, { waitUntil: 'networkidle' });
    await mobilePage.screenshot({ path: 'public/audit_mobile_viewport.png' });
    await mobilePage.screenshot({ path: 'public/audit_mobile_fullpage.png', fullPage: true });

    const mobileFindings = await mobilePage.evaluate(() => {
        const list = [];

        // Check horizontal body overflow
        if (document.body.scrollWidth > window.innerWidth) {
            list.push({
                type: 'CRITICAL_OVERFLOW',
                message: `Horizontal Body Overflow: document width (${document.body.scrollWidth}px) exceeds screen (${window.innerWidth}px)`
            });
        }

        // Check all sections
        const sections = Array.from(document.querySelectorAll('section, header, footer'));
        sections.forEach(s => {
            const sRect = s.getBoundingClientRect();
            if (s.scrollWidth > window.innerWidth + 2) {
                list.push({
                    type: 'SECTION_OVERFLOW',
                    id: s.id || s.tagName,
                    scrollWidth: s.scrollWidth,
                    windowWidth: window.innerWidth
                });
            }
        });

        // Check Stats Bar
        const statBoxes = Array.from(document.querySelectorAll('.grid-cols-2, .grid-cols-3, .grid-cols-4')).filter(g => g.innerText.includes('544') || g.innerText.includes('100%'));
        statBoxes.forEach(box => {
            Array.from(box.children).forEach(col => {
                const cRect = col.getBoundingClientRect();
                const children = Array.from(col.querySelectorAll('*'));
                children.forEach(ch => {
                    if (ch.scrollWidth > ch.clientWidth + 2 && ch.clientWidth > 0) {
                        list.push({
                            type: 'TEXT_CLIPPING',
                            text: ch.innerText.trim(),
                            scrollWidth: ch.scrollWidth,
                            clientWidth: ch.clientWidth
                        });
                    }
                });
            });
        });

        // Check Showcase Card & Overlapping Badges
        const badges = Array.from(document.querySelectorAll('.absolute')).filter(b => {
            if (b.closest('svg')) return false;
            if (b.classList.contains('pointer-events-none')) return false;
            if (b.classList.contains('inset-0') && !b.innerText.trim()) return false;
            if (b.id === 'menu-backdrop' || b.closest('#mobile-drawer')) return false;
            return true;
        });
        const interactive = Array.from(document.querySelectorAll('a, button, p, h3, h2, h1'));

        badges.forEach(badge => {
            const bRect = badge.getBoundingClientRect();
            if (bRect.width === 0 || bRect.height === 0) return;

            interactive.forEach(target => {
                if (badge.contains(target) || target.contains(badge) || badge === target) return;
                const tRect = target.getBoundingClientRect();
                if (tRect.width === 0 || tRect.height === 0) return;

                const xOverlap = Math.max(0, Math.min(bRect.right, tRect.right) - Math.max(bRect.left, tRect.left));
                const yOverlap = Math.max(0, Math.min(bRect.bottom, tRect.bottom) - Math.max(bRect.top, tRect.top));
                const area = xOverlap * yOverlap;

                if (area > 50) {
                    list.push({
                        type: 'ELEMENT_COLLISION',
                        badge: badge.innerText.replace(/\s+/g, ' ').trim(),
                        collidingWith: target.innerText.replace(/\s+/g, ' ').trim(),
                        overlapPixels: Math.round(area) + 'px²'
                    });
                }
            });
        });

        // Check Google Maps
        const mapIframe = document.querySelector('iframe[src*="maps"]');
        if (mapIframe) {
            const iRect = mapIframe.getBoundingClientRect();
            const pRect = mapIframe.parentElement.getBoundingClientRect();
            list.push({
                type: 'MAP_DIMENSIONS',
                containerHeight: Math.round(pRect.height) + 'px',
                iframeHeight: Math.round(iRect.height) + 'px',
                deadSpace: Math.round(pRect.height - iRect.height) + 'px',
                hasVoid: (pRect.height - iRect.height) > 40
            });
        }

        return list;
    });

    console.log('\nMobile Findings & Anomalies:', JSON.stringify(mobileFindings, null, 2));

    await browser.close();
}

audit().catch(err => {
    console.error('Audit failed:', err);
    process.exit(1);
});
