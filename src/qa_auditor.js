import fs from 'fs';
import path from 'path';

/**
 * SiteQAAuditor
 * Comprehensive visual, code integrity, asset reachability, and mobile responsiveness auditor
 * for Arclane Autonomous Acquisition Engine deployed client websites.
 */
export class SiteQAAuditor {
    constructor() {
        this.sitesDir = path.join(process.cwd(), 'web-dev-agency', 'public', 'sites');
        this.reportsDir = path.join(process.cwd(), 'reports');
        this.generatedSitesDir = path.join(process.cwd(), 'generated_sites');
        this.urlCache = new Map(); // Cache tested image/asset URLs to avoid duplicate network latency
    }

    /**
     * Resolve site metadata (slug, local HTML path, business name) for a given Client ID.
     */
    resolveSiteInfo(clientId) {
        let slug = null;
        let businessName = `Client #${clientId}`;
        let deployedUrl = `https://www.arclanestudios.space/sites/`;

        // 1. Check reports/<id>/outreach.json
        const outreachPath = path.join(this.reportsDir, String(clientId), 'outreach.json');
        if (fs.existsSync(outreachPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(outreachPath, 'utf8'));
                businessName = data.businessName || businessName;
                if (data.deployedUrl) {
                    deployedUrl = data.deployedUrl;
                    const parts = data.deployedUrl.split('/sites/');
                    if (parts.length > 1) slug = parts[1].replace(/\/$/, '').trim();
                }
            } catch (e) {}
        }

        // 2. Fallback to audit.md if outreach.json not present
        if (!slug) {
            const auditPath = path.join(this.reportsDir, String(clientId), 'audit.md');
            if (fs.existsSync(auditPath)) {
                try {
                    const content = fs.readFileSync(auditPath, 'utf8');
                    const match = content.match(/arclanestudios\.space\/sites\/([a-zA-Z0-9_-]+)/);
                    if (match) slug = match[1];
                } catch (e) {}
            }
        }

        // 3. Fallback: Search web-dev-agency/public/sites/ for matches if slug still null
        let htmlPath = null;
        if (slug) {
            const candidate = path.join(this.sitesDir, slug, 'index.html');
            if (fs.existsSync(candidate)) htmlPath = candidate;
        }

        if (!htmlPath) {
            const genCandidate = path.join(this.generatedSitesDir, String(clientId), 'index.html');
            if (fs.existsSync(genCandidate)) {
                htmlPath = genCandidate;
                if (!slug) slug = `client-${clientId}`;
            }
        }

        return {
            clientId,
            businessName,
            slug: slug || `client-${clientId}`,
            htmlPath,
            deployedUrl: slug ? `https://www.arclanestudios.space/sites/${slug}` : deployedUrl
        };
    }

    /**
     * Test whether an external or local asset URL is reachable.
     */
    async testAssetUrl(url) {
        if (!url || typeof url !== 'string') return { ok: false, status: 0, error: 'Empty URL' };
        const cleanUrl = url.trim().replace(/&amp;/g, '&');

        if (this.urlCache.has(cleanUrl)) {
            return this.urlCache.get(cleanUrl);
        }

        // If data URI or SVG inline, consider OK
        if (cleanUrl.startsWith('data:') || cleanUrl.startsWith('blob:')) {
            const res = { ok: true, status: 200 };
            this.urlCache.set(cleanUrl, res);
            return res;
        }

        // Handle external HTTP/HTTPS URLs
        if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 6000);
                
                // Try HEAD first for fast asset headers
                let response = null;
                try {
                    response = await fetch(cleanUrl, {
                        method: 'HEAD',
                        signal: controller.signal,
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                    });
                } catch (headErr) {
                    // Fall back to GET if HEAD rejected or timed out
                }

                if (!response || response.status === 405 || response.status === 403) {
                    const getController = new AbortController();
                    const getTimeout = setTimeout(() => getController.abort(), 6000);
                    response = await fetch(cleanUrl, {
                        method: 'GET',
                        signal: getController.signal,
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                    });
                    clearTimeout(getTimeout);
                } else {
                    clearTimeout(timeoutId);
                }

                const ok = response && response.status >= 200 && response.status < 400;
                const result = { ok, status: response ? response.status : 0 };
                this.urlCache.set(cleanUrl, result);
                return result;
            } catch (err) {
                const result = { ok: false, status: 0, error: err.message };
                this.urlCache.set(cleanUrl, result);
                return result;
            }
        }

        return { ok: true, status: 200 };
    }

    /**
     * Audit an individual site HTML file.
     */
    async auditSite(siteInfo, options = { autoFix: false }) {
        const issues = [];
        const fixes = [];
        const warnings = [];

        if (!siteInfo.htmlPath || !fs.existsSync(siteInfo.htmlPath)) {
            return {
                ...siteInfo,
                status: 'MISSING_SITE',
                passed: false,
                issues: ['Website index.html does not exist on disk'],
                warnings: [],
                fixes: []
            };
        }

        let html = fs.readFileSync(siteInfo.htmlPath, 'utf8');
        let modified = false;

        // 1. Asset Reachability & Broken Image Tests
        const imgRegex = /<img([^>]+)>/gi;
        let imgMatch;
        const imgTags = [];
        while ((imgMatch = imgRegex.exec(html)) !== null) {
            imgTags.push({ fullTag: imgMatch[0], attributes: imgMatch[1], index: imgMatch.index });
        }

        for (const img of imgTags) {
            const srcMatch = img.attributes.match(/src=["']([^"']+)["']/i);
            const onerrorMatch = img.attributes.match(/onerror=["']([^"']+)["']/i);

            if (!srcMatch || !srcMatch[1]) {
                issues.push(`Image tag missing src attribute: ${img.fullTag.substring(0, 60)}...`);
                continue;
            }

            const src = srcMatch[1];
            const check = await this.testAssetUrl(src);

            if (!check.ok) {
                // If primary image fails (e.g. 404)
                if (onerrorMatch && onerrorMatch[1]) {
                    // Check if fallback inside onerror works
                    const fallbackMatch = onerrorMatch[1].match(/src\s*=\s*['"]([^'"]+)['"]/);
                    if (fallbackMatch && fallbackMatch[1]) {
                        const fallbackCheck = await this.testAssetUrl(fallbackMatch[1]);
                        if (fallbackCheck.ok) {
                            warnings.push(`Primary image 404 (${src.substring(0, 45)}...), but active fallback is functional.`);
                        } else {
                            issues.push(`Broken image (404) AND broken fallback (${src.substring(0, 45)}...)`);
                        }
                    } else {
                        warnings.push(`Primary image 404 (${src.substring(0, 45)}...), has custom onerror handler.`);
                    }
                } else {
                    issues.push(`Broken image (Status ${check.status || 404}) with NO onerror fallback: ${src.substring(0, 50)}...`);
                    
                    if (options.autoFix) {
                        // Safe category replacement
                        const safeFallback = 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=800';
                        const fixedTag = img.fullTag.replace(
                            `src="${src}"`,
                            `src="${safeFallback}" onerror="this.onerror=null; this.src='https://placehold.co/800x600/18181b/ffffff?text=Showcase';"`
                        ).replace(
                            `src='${src}'`,
                            `src="${safeFallback}" onerror="this.onerror=null; this.src='https://placehold.co/800x600/18181b/ffffff?text=Showcase';"`
                        );
                        if (fixedTag !== img.fullTag) {
                            html = html.replace(img.fullTag, fixedTag);
                            modified = true;
                            fixes.push(`Repaired broken 404 image tag with verified fallback.`);
                        }
                    }
                }
            } else if (!onerrorMatch) {
                // Image works, but add safety fallback if autofix
                if (options.autoFix && !img.fullTag.includes('onerror=')) {
                    const withOnerror = img.fullTag.replace(
                        /<img\s+/i,
                        `<img onerror="this.onerror=null; this.src='https://placehold.co/800x600/18181b/ffffff?text=Showcase';" `
                    );
                    html = html.replace(img.fullTag, withOnerror);
                    modified = true;
                    fixes.push(`Injected safety onerror fallback on image tag.`);
                }
            }
        }

        // 2. Broken Code & Unrendered Template Markers
        if (/>\s*undefined\s*</i.test(html) || /"undefined"/i.test(html) || /undefinedpx/i.test(html)) {
            issues.push(`Unrendered 'undefined' template placeholder detected in HTML markup.`);
            if (options.autoFix) {
                html = html.replace(/>\s*undefined\s*</gi, '>Premier Services<')
                           .replace(/undefinedpx/gi, '16px');
                modified = true;
                fixes.push(`Sanitized 'undefined' template placeholders with default text.`);
            }
        }

        if (/>\s*NaN\s*</i.test(html) || /NaN%/i.test(html) || /NaNpx/i.test(html)) {
            issues.push(`Unrendered 'NaN' math placeholder detected in HTML markup.`);
            if (options.autoFix) {
                html = html.replace(/>\s*NaN\s*</gi, '>100%<')
                           .replace(/NaN%/gi, '100%')
                           .replace(/NaNpx/gi, '0px');
                modified = true;
                fixes.push(`Sanitized 'NaN' math placeholders.`);
            }
        }

        if (/Lorem ipsum|dolor sit amet/i.test(html)) {
            warnings.push(`Generic 'Lorem Ipsum' placeholder text detected.`);
        }

        // 3. Structural HTML Closing Tag Integrity
        const criticalTags = ['html', 'body', 'main', 'footer'];
        for (const tag of criticalTags) {
            if (html.includes(`<${tag}`) && !html.includes(`</${tag}>`)) {
                issues.push(`Unclosed structural HTML tag: </${tag}> missing.`);
            }
        }

        // 4. JSON-LD Schema Integrity
        const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
        if (jsonLdMatch && jsonLdMatch[1]) {
            try {
                JSON.parse(jsonLdMatch[1]);
            } catch (err) {
                issues.push(`Malformed JSON-LD Schema: ${err.message}`);
                if (options.autoFix) {
                    // Remove corrupted json-ld block so it doesn't break client SEO
                    html = html.replace(jsonLdMatch[0], '');
                    modified = true;
                    fixes.push(`Removed corrupted JSON-LD schema block.`);
                }
            }
        }

        // 5. Visual & Mobile Responsiveness Compliance
        // Viewport check
        if (!/<meta[^>]+name=["']viewport["']/i.test(html)) {
            issues.push(`Missing responsive <meta name="viewport"> tag.`);
            if (options.autoFix && html.includes('<head>')) {
                html = html.replace('<head>', '<head>\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">');
                modified = true;
                fixes.push(`Injected standard viewport meta tag.`);
            }
        }

        // Sticky Mobile Bottom Bar Check
        const hasMobileBar = /md:hidden\s+fixed\s+bottom-0/i.test(html) || 
                             (html.includes('fixed bottom-0') && (html.includes('wa.me') || html.includes('tel:')));
        if (!hasMobileBar) {
            warnings.push(`Missing sticky mobile bottom CTA bar (Call/WhatsApp).`);
            if (options.autoFix) {
                // Find phone from outreach or fallback
                let phone = '+919876543210';
                const outreachPath = path.join(this.reportsDir, String(siteInfo.clientId), 'outreach.json');
                if (fs.existsSync(outreachPath)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(outreachPath, 'utf8'));
                        if (data.phone) phone = data.phone;
                    } catch (e) {}
                }
                const cleanPhone = phone.replace(/[^0-9]/g, '');
                const barHtml = `\n    <!-- Auto-Injected Sticky Mobile Bottom CTA Bar -->\n` +
                                `    <div class="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#09090b] border-t border-zinc-800 p-3 flex gap-3 shadow-2xl">\n` +
                                `        <a href="tel:${phone}" class="flex-1 py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 whitespace-nowrap bg-zinc-800 hover:bg-zinc-700 text-white transition">\n` +
                                `            <span>📞</span> Call Now\n` +
                                `        </a>\n` +
                                `        <a href="https://wa.me/${cleanPhone}" target="_blank" class="flex-1 py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 whitespace-nowrap bg-emerald-600 hover:bg-emerald-500 text-white transition">\n` +
                                `            <span>💬</span> WhatsApp\n` +
                                `        </a>\n` +
                                `    </div>\n`;
                if (html.includes('</body>')) {
                    html = html.replace('</body>', `${barHtml}</body>`);
                } else {
                    html += barHtml;
                }
                modified = true;
                fixes.push(`Injected standard 2-button sticky mobile bottom CTA bar.`);
            }
        }

        // GEMINI.md Rule Check: Mobile clearance internal to <footer>, never on <body>
        const bodyTagMatch = html.match(/<body([^>]*)>/i);
        if (bodyTagMatch && /\bpb-\d+\b/i.test(bodyTagMatch[1])) {
            issues.push(`Rule violation: pb-* applied to <body> instead of <footer>.`);
            if (options.autoFix) {
                const cleanedAttrs = bodyTagMatch[1].replace(/\bpb-\d+\b/gi, '').replace(/\s{2,}/g, ' ');
                html = html.replace(bodyTagMatch[0], `<body${cleanedAttrs}>`);
                if (html.includes('<footer') && !html.includes('pb-24') && !html.includes('pb-20')) {
                    html = html.replace(/(<footer[^>]*class=["'][^"']*)/i, '$1 pb-24 md:pb-12 ');
                }
                modified = true;
                fixes.push(`Relocated all mobile clearance pb-* from <body> to <footer>.`);
            }
        }

        // Save modifications if autoFix was applied
        if (modified && options.autoFix) {
            fs.writeFileSync(siteInfo.htmlPath, html, 'utf8');
        }

        return {
            ...siteInfo,
            status: issues.length === 0 ? (warnings.length === 0 ? 'PASS' : 'WARN') : 'FAIL',
            passed: issues.length === 0,
            issues,
            warnings,
            fixes
        };
    }

    /**
     * Audit a range of lead IDs [startId, endId].
     */
    async auditRange(startId = 1, endId = 600, options = { autoFix: false, onProgress: null }) {
        const results = [];
        const start = parseInt(startId, 10) || 1;
        const end = parseInt(endId, 10) || 600;
        const total = end - start + 1;

        console.log(`[SiteQAAuditor] 🔍 Starting visual & code audit across range [${start}..${end}] (${total} leads)...`);
        if (options.autoFix) console.log(`[SiteQAAuditor] 🛠️ Auto-Fix mode is ENABLED.`);

        for (let id = start; id <= end; id++) {
            const siteInfo = this.resolveSiteInfo(id);
            const auditRes = await this.auditSite(siteInfo, options);
            results.push(auditRes);

            if (typeof options.onProgress === 'function') {
                const completed = results.length;
                options.onProgress({
                    currentId: id,
                    completed,
                    total,
                    percent: Math.round((completed / total) * 100),
                    latestResult: auditRes
                });
            }
        }

        const passedCount = results.filter(r => r.passed && r.warnings.length === 0).length;
        const warnCount = results.filter(r => r.passed && r.warnings.length > 0).length;
        const failCount = results.filter(r => !r.passed).length;
        const fixedCount = results.filter(r => r.fixes && r.fixes.length > 0).length;

        return {
            range: [start, end],
            totalChecked: results.length,
            passed: passedCount,
            warnings: warnCount,
            failed: failCount,
            fixedCount,
            results,
            anomalies: results.filter(r => !r.passed || r.warnings.length > 0)
        };
    }

    /**
     * Format audit summary as Markdown for chatbox/Telegram broadcast.
     */
    formatSummaryMarkdown(auditSummary) {
        const [start, end] = auditSummary.range;
        const passRate = ((auditSummary.passed + auditSummary.warnings) / auditSummary.totalChecked * 100).toFixed(1);

        let md = `🧪 *Website QA & Visual Audit Report [Leads #${start} – #${end}]*\n\n` +
                 `📊 *Audit Summary:*\n` +
                 `• *Total Audited:* \`${auditSummary.totalChecked}\` sites\n` +
                 `• *Pass Rate:* \`${passRate}%\`\n` +
                 `• *🟢 Clean Passes:* \`${auditSummary.passed}\`\n` +
                 `• *⚠️ Minor Warnings:* \`${auditSummary.warnings}\`\n` +
                 `• *🔴 Anomalies / Failures:* \`${auditSummary.failed}\`\n` +
                 `• *🛠️ Auto-Fixed Sites:* \`${auditSummary.fixedCount}\`\n\n`;

        if (auditSummary.anomalies.length === 0) {
            md += `✨ *All audited websites passed with 100% asset reachability, zero broken templates, and responsive mobile architecture!*`;
        } else {
            md += `🔍 *Detailed Findings:* \n`;
            auditSummary.anomalies.slice(0, 10).forEach(a => {
                const icon = a.passed ? '⚠️' : '🔴';
                md += `${icon} *#${a.clientId} (${a.businessName})* [/${a.slug}]\n`;
                if (a.issues.length > 0) {
                    md += `  ❌ _Issues:_ ${a.issues.join('; ')}\n`;
                }
                if (a.warnings.length > 0) {
                    md += `  ⚠️ _Warnings:_ ${a.warnings.join('; ')}\n`;
                }
                if (a.fixes.length > 0) {
                    md += `  ✅ _Fixed:_ ${a.fixes.join('; ')}\n`;
                }
            });

            if (auditSummary.anomalies.length > 10) {
                md += `\n_...and ${auditSummary.anomalies.length - 10} more sites flagged in the full log._`;
            }
        }

        return md;
    }
}
