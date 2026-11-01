import fs from 'fs';
import path from 'path';
import { AgencyPublisher } from '../src/agency_publisher.js';

const VERIFIED_POOLS = {
    gym: [
        'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=800&q=80'
    ],
    restaurant: [
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80'
    ],
    cafe_bakery: [
        'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=800&q=80'
    ],
    dental: [
        'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=800&q=80'
    ]
};

function getPoolForNiche(niche = '') {
    const n = niche.toLowerCase();
    if (n.includes('dent') || n.includes('clinic')) return VERIFIED_POOLS.dental;
    if (n.includes('cafe') || n.includes('baker') || n.includes('dessert') || n.includes('waffle')) return VERIFIED_POOLS.cafe_bakery;
    if (n.includes('gym') || n.includes('fitness') || n.includes('mma') || n.includes('crossfit')) return VERIFIED_POOLS.gym;
    return VERIFIED_POOLS.restaurant;
}

async function fixAllBrokenImages() {
    console.log('===========================================================');
    console.log('🛠️ REPAIRING ALL BROKEN IMAGES ACROSS GENERATED SITES');
    console.log('===========================================================');

    const audit = JSON.parse(fs.readFileSync('data_exports/broken_images_audit.json', 'utf8'));
    const leads = JSON.parse(fs.readFileSync('data_exports/crm_leads_latest.json', 'utf8'));
    const leadMap = {};
    leads.forEach(l => { leadMap[l['Client ID']] = l; });

    const brokenSet = new Set(audit.brokenUrls);
    const affectedSiteIds = Object.keys(audit.affectedSites);
    console.log(`Targeting ${affectedSiteIds.length} sites with broken images...`);

    const publisher = new AgencyPublisher();
    let fixedCount = 0;

    for (const id of affectedSiteIds) {
        const lead = leadMap[id] || {};
        const niche = lead['Industry/Niche'] || '';
        const businessName = lead['Business Name'] || `Client ${id}`;
        const pool = getPoolForNiche(niche);

        const siteDir = path.join(process.cwd(), 'generated_sites', id);
        const indexFile = path.join(siteDir, 'index.html');
        if (!fs.existsSync(indexFile)) continue;

        let html = fs.readFileSync(indexFile, 'utf8');
        let modified = false;

        // Replace un-interpolated template literals like ${item.image}
        if (html.includes('${item.image}') || html.includes('${item.img}') || html.includes('${')) {
            html = html.replace(/\$\{item\.(image|img)\}/g, pool[0]);
            modified = true;
        }

        // Replace any broken URLs
        let poolIdx = 0;
        for (const badUrl of brokenSet) {
            if (html.includes(badUrl)) {
                const replacement = pool[poolIdx % pool.length];
                poolIdx++;
                html = html.split(badUrl).join(replacement);
                modified = true;
            }
        }

        if (modified) {
            fs.writeFileSync(indexFile, html, 'utf8');
            // Also stage for agency hosted repo
            await publisher.stageSite(id, businessName, html);
            fixedCount++;
        }
    }

    console.log(`\n✅ Repaired HTML for ${fixedCount} sites locally and staged for repo.`);
    console.log('Deploying repaired sites to agency publisher repo...');
    await publisher.deployBatch(msg => console.log(msg));
    console.log('🎉 Deploy complete! All broken images repaired and live.');
}

fixAllBrokenImages().catch(console.error);
