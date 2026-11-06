/**
 * ArcLane Studios Agency Branding & Courtesy Credit Utility
 * 
 * Unifies the footer into a single, high-converting, pristine signature strip
 * with zero dual footers, zero duplicate copyright statements, safe current-year anchor,
 * and mathematical alignment inside the footer's max-w container with mobile clearance.
 */

export function cleanHtmlTags(html) {
    let cleaned = html;

    // 1. Remove invalid meta X-Frame-Options
    cleaned = cleaned.replace(/<meta\s+http-equiv=["']X-Frame-Options["'][^>]*>/gi, '');

    // 2. Fix broken </div without >
    cleaned = cleaned.replace(/<\/div(?![a-zA-Z0-9_>-])/gi, '</div>');

    // 3. Fix stray > after closing tags: e.g. </div>> -> </div>
    cleaned = cleaned.replace(/<\/(div|section|span|p|a|h[1-6]|header|footer|ul|li)>>+/gi, '</$1>');

    // 4. Fix inline mangled pattern: class="..."</div
    cleaned = cleaned.replace(/(class=["'][^"']*?["'])\s*<\/div/gi, '$1></div>');

    // 5. Fix unclosed opening tags at end of line (<img ... or <div ...)
    cleaned = cleaned.replace(/(<[a-zA-Z0-9-]+(?:\s+[^>]*?)?["'])(?=\s*\r?\n\s*<)/gi, (match) => {
        if (!match.includes('>')) return match + '>';
        return match;
    });

    // 6. Ensure all <img tags are properly closed with > before any child/sibling tag
    cleaned = cleaned.replace(/<img\b([^>]*?)(?=\s*<\/?(?:div|span|p|section|a|h[1-6]|ul|li|footer|header|aside)\b)/gi, (m, attrs) => {
        let a = attrs.trim();
        if (!a.endsWith('>')) {
            if ((a.match(/"/g) || []).length % 2 !== 0) a += '"';
            return `<img ${a}>`;
        }
        return m;
    });

    // 7. Fix corrupted nested quotes in onerror handlers:
    cleaned = cleaned.replace(/onerror=["']this\.onerror=null;\s*this\.src=["']([^"']+)["'];?["']/gi, (m, url) => {
        return `onerror="this.onerror=null; this.src='${url}';"`;
    });

    // 8. Protect script current-year textContent from throwing TypeError if element is missing
    cleaned = cleaned.replace(/document\.getElementById\(['"]current-year['"]\)\.textContent\s*=\s*[^;]+;/gi, () => {
        return `const cyEl = document.getElementById('current-year'); if (cyEl) cyEl.textContent = new Date().getFullYear();`;
    });

    // 9. Fix unclosed opening tags followed by inner text and unclosed closing tag:
    cleaned = cleaned.replace(/<([a-zA-Z0-9-]+)(\s+[^>]*?=["'][^"']*?["'])([^<>]*?)<\/\1(?![a-zA-Z0-9_>-])>?/gi, (m, tag, attrs, text) => {
        return `<${tag}${attrs}>${text}</${tag}>`;
    });

    // 10. Fix empty tag matches: e.g. <i class="..."</i -> <i class="..."></i>
    cleaned = cleaned.replace(/<([a-zA-Z0-9-]+)(\s+[^>]*?=["'][^"']*?["'])<\/\1(?![a-zA-Z0-9_>-])>?/gi, (m, tag, attrs) => {
        return `<${tag}${attrs}></${tag}>`;
    });

    // 11. Fix empty responsive prefixes: e.g. text-2xl sm: md: lg: xl:
    cleaned = cleaned.replace(/\b(?:sm|md|lg|xl|2xl):\s+/g, '');

    // 12. Fix conflicting duplicate responsive font sizes
    cleaned = cleaned.replace(/\btext-2xl\s+sm:text-3xl\s+md:text-2xl\s+sm:text-3xl\s+md:text-4xl\b/g, 'text-2xl sm:text-3xl lg:text-4xl');

    return cleaned;
}

export function replaceBottomBarWithBalancing(footerHtml, replacementHtml) {
    let f = footerHtml;

    const startMatch = f.match(/<(?:div|section)[^>]*class=["'][^"']*(?:pt-8|border-t|mt-8|text-center|justify-between)[^"']*["'][^>]*>(?=[\s\S]*?(?:&copy;|©|current-year|All rights reserved))/i);
    if (!startMatch) {
        return f.replace(/<\/footer>/i, `${replacementHtml}\n</footer>`);
    }

    const startIdx = startMatch.index;
    const tagContent = f.slice(startIdx);

    let depth = 0;
    let endIdx = -1;
    const tagRegex = /<\/?(?:div|section)\b[^>]*>/gi;
    let match;

    while ((match = tagRegex.exec(tagContent)) !== null) {
        const isClose = match[0].startsWith('</');
        if (!isClose) {
            depth++;
        } else {
            depth--;
            if (depth === 0) {
                endIdx = startIdx + match.index + match[0].length;
                break;
            }
        }
    }

    if (endIdx !== -1) {
        return f.slice(0, startIdx) + replacementHtml + f.slice(endIdx);
    }

    return f.replace(/<\/footer>/i, `${replacementHtml}\n</footer>`);
}

export function injectAgencyCredit(html, businessName = '') {
    if (!html || typeof html !== 'string') return html;

    const cleanName = (businessName || 'All Rights Reserved').replace(/"/g, '&quot;');

    // Idempotency Short-Circuit: If verified signature is already stamped, preserve perfectly
    if (html.includes('<!-- Unified ArcLane Verified Footer Signature -->')) {
        if (businessName) {
            return html.replace(/(<p>&copy;\s*<span id="current-year">\d+<\/span>\s*)([^.<]+)(\.\s*All rights reserved\.<\/p>)/i, `$1${cleanName}$3`);
        }
        return html;
    }

    // 1. Clean syntax anomalies and tags first
    let cleaned = cleanHtmlTags(html);

    // 2. Remove legacy duplicate arclane-agency-credit blocks and existing signatures
    cleaned = cleaned.replace(/<!-- ArcLane Studios Agency Courtesy Credit[\s\S]*?<\/div>\s*<\/div>/gi, '');
    cleaned = cleaned.replace(/<div class=["']arclane-agency-credit[\s\S]*?<\/div>\s*<\/div>/gi, '');
    cleaned = cleaned.replace(/<div class=["']arclane-agency-credit[\s\S]*?<\/div>/gi, '');
    cleaned = cleaned.replace(/<!-- Unified ArcLane Verified Footer Signature[\s\S]*?<!-- End ArcLane Signature -->/gi, '');

    // 3. Strip conflicting duplicate body padding
    cleaned = cleaned.replace(/(<body\b[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, classes, p3) => {
        let c = classes;
        if (c.includes('pb-28') && (c.includes('md:pb-0') || c.includes('lg:pb-0'))) {
            c = c.replace(/\s*\bpb-24\b/g, '').replace(/\s*\bpb-20\b/g, '');
        }
        return `${p1}${c.trim()}${p3}`;
    });

    // 4. Adjust footer tag padding: pt-12 sm:pt-16 pb-28 md:pb-16 (clears sticky mobile action bar)
    cleaned = cleaned.replace(/(<footer\b[^>]*class=["'])([^"']*)(["'])/gi, (m, p1, classes, p3) => {
        let c = classes.replace(/\b(?:sm:|md:|lg:|xl:)?(?:py|pb|pt)-\d+\b/g, '').replace(/\s+/g, ' ').trim();
        return `${p1}${c} pt-12 sm:pt-16 pb-28 md:pb-16${p3}`;
    });

    const signatureInner = `
            <!-- Unified ArcLane Verified Footer Signature -->
            <div class="pt-8 mt-8 sm:mt-12 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-4">
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

    const footerMatch = cleaned.match(/<footer[\s\S]*?<\/footer>/i);
    if (footerMatch) {
        let f = footerMatch[0];

        // Replace existing bottom bar using mathematical depth balancing
        const hasBottomBar = /<(?:div|section)[^>]*class=["'][^"']*(?:pt-8|border-t|mt-8|text-center|justify-between)[^"']*["'][^>]*>(?=[\s\S]*?(?:&copy;|©|current-year|All rights reserved))/i.test(f);

        let newFooter = '';
        if (hasBottomBar) {
            newFooter = replaceBottomBarWithBalancing(f, signatureInner);
        } else {
            // Check if footer has an inner container
            const maxWMatch = f.match(/<div[^>]*class=["'][^"']*max-w-[^"']*["'][^>]*>/i);
            if (maxWMatch) {
                const maxWIdx = maxWMatch.index;
                const restOfFooter = f.slice(maxWIdx);
                let depth = 0;
                let closeDivIdx = -1;
                const divRegex = /<\/?div\b[^>]*>/gi;
                let dMatch;
                while ((dMatch = divRegex.exec(restOfFooter)) !== null) {
                    if (!dMatch[0].startsWith('</')) depth++;
                    else {
                        depth--;
                        if (depth === 0) {
                            closeDivIdx = maxWIdx + dMatch.index;
                            break;
                        }
                    }
                }
                if (closeDivIdx !== -1) {
                    newFooter = f.slice(0, closeDivIdx) + signatureInner + '\n        </div>' + f.slice(closeDivIdx + 6);
                } else {
                    newFooter = f.replace(/<\/footer>/i, `<div class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">${signatureInner}</div>\n</footer>`);
                }
            } else {
                newFooter = f.replace(/<\/footer>/i, `<div class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">${signatureInner}</div>\n</footer>`);
            }
        }

        const beforeFooter = cleaned.slice(0, footerMatch.index);
        const afterFooter = cleaned.slice(footerMatch.index + footerMatch[0].length);
        cleaned = beforeFooter + newFooter + afterFooter;
    } else if (cleaned.includes('</body>')) {
        cleaned = cleaned.replace('</body>', `<div class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-28 md:pb-16">${signatureInner}</div>\n</body>`);
    } else {
        cleaned = cleaned + `<div class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-28 md:pb-16">${signatureInner}</div>`;
    }

    return cleaned;
}
