/**
 * ArcLane Studios Agency Branding & Courtesy Credit Utility
 * 
 * Injects a sleek, subtle, high-converting agency courtesy credit into
 * the footer of all client demo websites across scrapes, pipelines, /fix, and batch operations.
 */

export function injectAgencyCredit(html, businessName = '') {
    if (!html || typeof html !== 'string') return html;

    // Prevent duplicate injections
    if (html.includes('arclane-agency-credit') || html.includes('Concept &amp; Digital Experience by') || html.includes('https://www.arclanestudios.space')) {
        return html;
    }

    const cleanName = (businessName || 'All Rights Reserved').replace(/"/g, '&quot;');

    const creditHtml = `
    <!-- ArcLane Studios Agency Courtesy Credit (Brand Signature) -->
    <div class="arclane-agency-credit w-full py-4 mt-6 border-t border-zinc-800/80 bg-black/40 text-center text-xs text-zinc-500">
        <div class="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-center gap-2">
            <span>© 2026 ${cleanName}. All rights reserved.</span>
            <span class="hidden sm:inline text-zinc-700">•</span>
            <a href="https://www.arclanestudios.space" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 font-medium text-zinc-400 hover:text-white transition-colors group">
                <span>Concept &amp; Digital Architecture by</span>
                <span class="text-white font-bold tracking-tight group-hover:text-primary transition-colors">ArcLane Studios</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-zinc-500 group-hover:text-primary transition-colors"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </a>
        </div>
    </div>`;

    if (html.includes('</footer>')) {
        return html.replace('</footer>', `${creditHtml}\n</footer>`);
    } else if (html.includes('</body>')) {
        return html.replace('</body>', `${creditHtml}\n</body>`);
    }
    return html + creditHtml;
}
