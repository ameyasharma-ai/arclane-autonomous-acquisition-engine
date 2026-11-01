import fs from 'fs';
import path from 'path';

async function performDeepInspection() {
    console.log('[Audit] Reading exported offline snapshot...');
    const data = JSON.parse(fs.readFileSync('data_exports/crm_leads_latest.json', 'utf8'));
    console.log(`[Audit] Total records loaded: ${data.length}`);

    const results = {
        totalLeads: data.length,
        industryCounts: {},
        localityCounts: {},
        ratingBreakdown: {
            unrated: 0,
            below4: 0,
            between4And45: 0,
            between45And49: 0,
            perfect5: 0,
            totalReviewCount: 0
        },
        contactStats: {
            hasPhone: 0,
            hasWhatsapp: 0,
            hasSocials: 0,
            hasExistingWebsite: 0,
            hasAgencyHostedUrl: 0
        },
        localSiteInspection: {
            sitesChecked: 0,
            sitesFound: 0,
            missingSites: [],
            htmlFilesChecked: 0,
            responsiveMetaPresent: 0,
            hasWhatsAppButton: 0,
            hasDirectCallButton: 0,
            brokenLocalAssets: [],
            emptyImageSources: [],
            externalAssetDependencies: 0,
            averageHtmlSizeBytes: 0
        },
        priorityDistribution: {
            HIGH: 0,
            MEDIUM: 0,
            LOW: 0,
            OTHER: 0
        }
    };

    let totalHtmlBytes = 0;

    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const id = item['Client ID'] || String(i + 1);
        const name = item['Business Name'];
        const industry = item['Industry/Niche'] || 'Unspecified';
        const locality = item['City/State'] || 'Patna';
        const rating = parseFloat(item['Ratings'] || item['Rating'] || '0');
        const reviews = parseInt(item['Number Of Reviews'] || item['Number of reviews'] || '0', 10);
        const phone = item['Phone/WhatsApp'] || '';
        const hostedUrl = item['Agency Hosted URL'] || '';
        const existingWebsite = item['Existing Website'] || '';
        const socials = item['Socials'] || '';
        const priority = (item['Priority Level'] || '').toUpperCase();

        // Industries & Localities
        results.industryCounts[industry] = (results.industryCounts[industry] || 0) + 1;
        results.localityCounts[locality] = (results.localityCounts[locality] || 0) + 1;

        // Contacts
        if (phone && phone.trim() !== '') results.contactStats.hasPhone++;
        if (phone && phone.includes('+91')) results.contactStats.hasWhatsapp++;
        if (socials && socials.trim() !== '') results.contactStats.hasSocials++;
        if (existingWebsite && existingWebsite.trim() !== '') results.contactStats.hasExistingWebsite++;
        if (hostedUrl && hostedUrl.trim() !== '') results.contactStats.hasAgencyHostedUrl++;

        // Ratings
        if (rating === 0) results.ratingBreakdown.unrated++;
        else if (rating < 4.0) results.ratingBreakdown.below4++;
        else if (rating < 4.5) results.ratingBreakdown.between4And45++;
        else if (rating < 5.0) results.ratingBreakdown.between45And49++;
        else if (rating === 5.0) results.ratingBreakdown.perfect5++;

        if (!isNaN(reviews)) results.ratingBreakdown.totalReviewCount += reviews;

        // Priority
        if (priority.includes('HIGH')) results.priorityDistribution.HIGH++;
        else if (priority.includes('MED')) results.priorityDistribution.MEDIUM++;
        else if (priority.includes('LOW')) results.priorityDistribution.LOW++;
        else results.priorityDistribution.OTHER++;

        // Check Local Website Directory
        results.localSiteInspection.sitesChecked++;
        const siteDir = path.join(process.cwd(), 'generated_sites', String(id));
        const indexFile = path.join(siteDir, 'index.html');

        if (fs.existsSync(indexFile)) {
            results.localSiteInspection.sitesFound++;
            results.localSiteInspection.htmlFilesChecked++;
            const stat = fs.statSync(indexFile);
            totalHtmlBytes += stat.size;
            const content = fs.readFileSync(indexFile, 'utf8');

            if (content.includes('viewport')) results.localSiteInspection.responsiveMetaPresent++;
            if (content.includes('whatsapp') || content.includes('wa.me') || content.includes('api.whatsapp.com')) {
                results.localSiteInspection.hasWhatsAppButton++;
            }
            if (content.includes('tel:') || content.includes('href="tel:')) {
                results.localSiteInspection.hasDirectCallButton++;
            }

            // Inspect image tags
            const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
            let match;
            while ((match = imgRegex.exec(content)) !== null) {
                const src = match[1];
                if (!src || src.trim() === '' || src === '#' || src === 'undefined') {
                    results.localSiteInspection.emptyImageSources.push({ id, name, src });
                } else if (!src.startsWith('http') && !src.startsWith('//') && !src.startsWith('data:')) {
                    const localAsset = path.join(siteDir, src.split('?')[0]);
                    if (!fs.existsSync(localAsset)) {
                        results.localSiteInspection.brokenLocalAssets.push({ id, name, src });
                    }
                } else {
                    results.localSiteInspection.externalAssetDependencies++;
                }
            }
        } else {
            results.localSiteInspection.missingSites.push({ id, name, hostedUrl });
        }
    }

    if (results.localSiteInspection.htmlFilesChecked > 0) {
        results.localSiteInspection.averageHtmlSizeBytes = Math.round(totalHtmlBytes / results.localSiteInspection.htmlFilesChecked);
    }

    fs.writeFileSync('data_exports/deep_inspection_summary.json', JSON.stringify(results, null, 2), 'utf8');
    console.log('[Audit] Deep inspection finished successfully.');
    console.log(`[Audit] Verified Sites Found: ${results.localSiteInspection.sitesFound} / ${results.totalLeads}`);
    console.log(`[Audit] Responsive Viewport: ${results.localSiteInspection.responsiveMetaPresent}`);
    console.log(`[Audit] WhatsApp CTAs: ${results.localSiteInspection.hasWhatsAppButton}`);
    console.log(`[Audit] Direct Phone CTAs: ${results.localSiteInspection.hasDirectCallButton}`);
    console.log(`[Audit] Broken Local Assets: ${results.localSiteInspection.brokenLocalAssets.length}`);
    console.log(`[Audit] Empty Image Sources: ${results.localSiteInspection.emptyImageSources.length}`);
}

performDeepInspection().catch(console.error);

