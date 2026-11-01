import fs from 'fs';
import path from 'path';

export async function runFullAudit(records) {
    console.log(`\n======================================================`);
    console.log(`🔍 RUNNING ASSET & VISUAL AUDIT ACROSS ${records.length} LEADS`);
    console.log(`======================================================\n`);

    const auditResults = {
        totalLeads: records.length,
        withHostedUrl: 0,
        withExistingWebsite: 0,
        localSiteFound: 0,
        localSiteMissing: 0,
        missingAssets: [],
        brokenImages: [],
        malformedUrls: [],
        industryDistribution: {},
        localityDistribution: {},
        ratingsStats: {
            ratedCount: 0,
            avgRating: 0,
            fiveStars: 0,
            highReviewsCount: 0
        },
        siteVisualHealth: {
            cleanMobileResponsive: 0,
            hasWhatsAppCta: 0,
            hasDirectCallCta: 0,
            hasStructuredMenuOrServices: 0
        }
    };

    let totalRatingSum = 0;

    for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const clientId = r['Client ID'] || String(i + 1);
        const businessName = r['Business Name'] || 'Unknown';
        const hostedUrl = r['Agency Hosted URL'] || '';
        const existingWebsite = r['Existing Website'] || '';
        const industry = r['Industry/Niche'] || 'Uncategorized';
        const locality = r['City/State'] || 'Patna';
        const rating = parseFloat(r['Ratings'] || r['Rating'] || '0');
        const reviews = parseInt(r['Number Of Reviews'] || r['Number of reviews'] || '0', 10);

        // Stats
        auditResults.industryDistribution[industry] = (auditResults.industryDistribution[industry] || 0) + 1;
        auditResults.localityDistribution[locality] = (auditResults.localityDistribution[locality] || 0) + 1;

        if (hostedUrl) auditResults.withHostedUrl++;
        if (existingWebsite) auditResults.withExistingWebsite++;
        if (rating > 0) {
            auditResults.ratingsStats.ratedCount++;
            totalRatingSum += rating;
            if (rating >= 4.8) auditResults.ratingsStats.fiveStars++;
        }
        if (reviews > 100) auditResults.ratingsStats.highReviewsCount++;

        // Check local site assets
        const localSiteDir = path.join(process.cwd(), 'generated_sites', String(clientId));
        const indexPath = path.join(localSiteDir, 'index.html');

        if (fs.existsSync(indexPath)) {
            auditResults.localSiteFound++;
            const html = fs.readFileSync(indexPath, 'utf8');

            // Visual & Asset inspections
            if (html.includes('whatsapp') || html.includes('wa.me') || html.includes('api.whatsapp.com')) {
                auditResults.siteVisualHealth.hasWhatsAppCta++;
            }
            if (html.includes('tel:') || html.includes('Call')) {
                auditResults.siteVisualHealth.hasDirectCallCta++;
            }
            if (html.includes('meta name="viewport"') || html.includes('viewport')) {
                auditResults.siteVisualHealth.cleanMobileResponsive++;
            }
            if (html.includes('menu') || html.includes('service') || html.includes('pricing') || html.includes('specialties')) {
                auditResults.siteVisualHealth.hasStructuredMenuOrServices++;
            }

            // Check for broken local image links or empty src tags
            const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
            for (const m of imgMatches) {
                const src = m[1];
                if (!src || src.trim() === '' || src === '#' || src === 'undefined') {
                    auditResults.brokenImages.push({ clientId, businessName, issue: 'Empty image src', src });
                } else if (!src.startsWith('http') && !src.startsWith('//') && !src.startsWith('data:')) {
                    // Local relative asset check
                    const assetPath = path.join(localSiteDir, src.split('?')[0]);
                    if (!fs.existsSync(assetPath)) {
                        auditResults.missingAssets.push({ clientId, businessName, missingAsset: src });
                    }
                }
            }
        } else {
            auditResults.localSiteMissing++;
        }
    }

    if (auditResults.ratingsStats.ratedCount > 0) {
        auditResults.ratingsStats.avgRating = (totalRatingSum / auditResults.ratingsStats.ratedCount).toFixed(2);
    }

    return auditResults;
}
