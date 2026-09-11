import fs from 'fs';
import path from 'path';

/**
 * Automated Pre-Flight QA Validator for generated client demo websites.
 * Tests HTML integrity, responsiveness parameters, contact CTAs, and safety.
 */
export class WebsiteQAValidator {
    constructor() {
        this.requiredHtmlElements = ['<!DOCTYPE html>', '<html', '<head', '<body', '</html>'];
    }

    /**
     * Inspects a site directory and returns QA_PASSED or QA_FAILED with full diagnostic checklist.
     */
    validateSite(siteDir, businessName = '') {
        const indexHtmlPath = path.join(siteDir, 'index.html');
        const diagnostics = [];
        let passed = true;

        // 1. File existence check
        if (!fs.existsSync(indexHtmlPath)) {
            return {
                status: 'QA_FAILED',
                passed: false,
                errors: [`index.html not found in workspace: ${siteDir}`],
                diagnostics: ['File missing']
            };
        }

        const html = fs.readFileSync(indexHtmlPath, 'utf-8');
        const sizeBytes = Buffer.byteLength(html, 'utf8');

        // 2. Minimum file size test (A complete production landing page should be at least 5KB)
        if (sizeBytes < 5000) {
            passed = false;
            diagnostics.push(`❌ File size abnormally small (${(sizeBytes / 1024).toFixed(1)} KB). Possible truncated HTML.`);
        } else {
            diagnostics.push(`✅ Size check passed: ${(sizeBytes / 1024).toFixed(1)} KB`);
        }

        // 3. Structural HTML completeness
        for (const tag of this.requiredHtmlElements) {
            if (!html.toLowerCase().includes(tag.toLowerCase())) {
                passed = false;
                diagnostics.push(`❌ Missing critical HTML structure: ${tag}`);
            }
        }

        // 4. Viewport meta tag check (Mandatory for mobile responsiveness)
        if (!html.includes('name="viewport"') || !html.includes('width=device-width')) {
            passed = false;
            diagnostics.push('❌ Missing responsive meta viewport tag');
        } else {
            diagnostics.push('✅ Mobile viewport tag verified');
        }

        // 5. Business Name presence check
        if (businessName) {
            const cleanName = businessName.replace(/[^a-zA-Z0-9\s]/g, '').trim();
            const nameTokens = cleanName.split(/\s+/).filter(t => t.length > 2);
            const matchesName = nameTokens.some(token => html.toLowerCase().includes(token.toLowerCase()));
            if (!matchesName) {
                diagnostics.push(`⚠️ Warning: Business name token "${cleanName}" not explicitly found in HTML.`);
            } else {
                diagnostics.push(`✅ Business branding verified in content`);
            }
        }

        // 6. Interactive CTA check (tel: and wa.me links)
        const hasTel = html.includes('href="tel:') || html.includes("href='tel:");
        const hasWhatsApp = html.includes('wa.me') || html.includes('api.whatsapp.com');
        if (!hasTel && !hasWhatsApp) {
            passed = false;
            diagnostics.push('❌ No direct click-to-call (tel:) or WhatsApp CTA links found.');
        } else {
            diagnostics.push(`✅ Direct contact CTAs verified (tel: ${hasTel}, wa.me: ${hasWhatsApp})`);
        }

        // 7. Security check: Zero embedded API tokens or private keys
        const sensitivePatterns = [/sk-[a-zA-Z0-9]{20,}/, /AIza[0-9A-Za-z-_]{35}/, /ghp_[a-zA-Z0-9]{36}/, /vercel_[a-zA-Z0-9]{20,}/];
        for (const pattern of sensitivePatterns) {
            if (pattern.test(html)) {
                passed = false;
                diagnostics.push('🚨 CRITICAL SECURITY FAIL: Embedded secret or API token detected in frontend HTML!');
            }
        }

        return {
            status: passed ? 'QA_PASSED' : 'QA_FAILED',
            passed,
            diagnostics,
            errors: passed ? [] : diagnostics.filter(d => d.startsWith('❌') || d.startsWith('🚨'))
        };
    }
}
