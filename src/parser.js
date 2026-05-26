import * as cheerio from 'cheerio';

export function compressHtmlToText(html) {
    if (!html) return '';
    const $ = cheerio.load(html);
    
    // Remove unnecessary elements
    $('script, style, noscript, nav, footer, iframe, svg, img, video, audio, form').remove();
    
    // Try to get main content, or fallback to body
    let content = $('main').text();
    if (!content.trim()) {
        content = $('body').text();
    }
    
    // Clean up whitespace
    return content.replace(/\s+/g, ' ').trim().substring(0, 100000); // Increased limit per page for huge LLM context
}
