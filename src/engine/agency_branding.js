/**
 * ArcLane Studios Agency Branding & Courtesy Credit Utility
 * 
 * Unifies the footer into a single, high-converting, pristine signature strip
 * with zero dual footers, zero duplicate copyright statements, and safe current-year anchor.
 */

export function injectAgencyCredit(html, businessName = '') {
    if (!html || typeof html !== 'string') return html;

    const cleanName = (businessName || 'All Rights Reserved').replace(/"/g, '&quot;');

    // 1. Purge any duplicate or legacy arclane-agency-credit blocks
    let cleaned = html.replace(/<!-- ArcLane Studios Agency Courtesy Credit[\s\S]*?<\/div>\s*<\/div>/gi, '');
    cleaned = cleaned.replace(/<div class=["']arclane-agency-credit[\s\S]*?<\/div>\s*<\/div>/gi, '');
    cleaned = cleaned.replace(/<div class=["']arclane-agency-credit[\s\S]*?<\/div>/gi, '');
    cleaned = cleaned.replace(/<!-- Unified ArcLane Verified Footer Signature[\s\S]*?<!-- End ArcLane Signature -->/gi, '');

    const unifiedBottomBar = `
            <!-- Unified ArcLane Verified Footer Signature -->
            <div class="pt-8 mt-8 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-4">
                <p>&copy; <span id="current-year">2026</span> ${cleanName}. All rights reserved.</p>
                <a href="https://www.arclanestudios.space" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 font-medium text-zinc-400 hover:text-white transition-colors group">
                    <span>Concept &amp; Digital Architecture by</span>
                    <span class="text-white font-bold tracking-tight group-hover:text-amber-400 transition-colors">ArcLane Studios</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-zinc-500 group-hover:text-amber-400 transition-colors"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>
                <div class="flex items-center gap-4 text-zinc-500">
                    <span class="hover:text-zinc-400 cursor-pointer">Privacy Policy</span>
                    <span>•</span>
                    <span class="hover:text-zinc-400 cursor-pointer">Terms of Service</span>
                </div>
            </div>
            <!-- End ArcLane Signature -->`;

    if (cleaned.includes('<footer')) {
        const footerParts = cleaned.split(/<footer\b/i);
        const beforeFooter = footerParts[0];
        let footerContent = '<footer' + footerParts.slice(1).join('<footer');

        // Pattern matching existing bottom copyright bar inside footer
        const bottomBarRegex = /<(?:div|section)[^>]*class=["'][^"']*(?:pt-8|border-t|mt-8|text-center|justify-between)[^"']*["'][^>]*>[\s\S]*?(?:&copy;|©|current-year|All rights reserved)[\s\S]*?<\/(?:div|section)>/i;

        if (bottomBarRegex.test(footerContent)) {
            footerContent = footerContent.replace(bottomBarRegex, unifiedBottomBar);
        } else {
            footerContent = footerContent.replace(/<\/footer>/i, `${unifiedBottomBar}\n</footer>`);
        }

        return beforeFooter + footerContent;
    } else if (cleaned.includes('</body>')) {
        return cleaned.replace('</body>', `${unifiedBottomBar}\n</body>`);
    }

    return cleaned + unifiedBottomBar;
}
