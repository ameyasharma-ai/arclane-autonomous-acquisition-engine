import { AgencyPublisher } from '../src/agency_publisher.js';
import { loadGoogleSheet } from '../src/sheets.js';

async function finishSync() {
    console.log('[Deploy] Deploying batch of staged sites to GitHub...');
    const publisher = new AgencyPublisher();
    await publisher.deployBatch(msg => console.log(msg));
    console.log('✅ Batch deploy finished.');

    console.log('[GoogleSheet] Updating rows for 333, 334, 413...');
    const { sheet } = await loadGoogleSheet();
    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();

    for (const r of rows) {
        const id = r.get('Client ID');
        if (id === '333') {
            r.set('Agency Hosted URL', 'https://www.arclanestudios.space/sites/waffleco');
            r.set('Current Status', 'Analyzed & Built');
            await r.save();
            console.log('✅ Updated Lead #333');
        } else if (id === '334') {
            r.set('Agency Hosted URL', 'https://www.arclanestudios.space/sites/client334');
            r.set('Current Status', 'Analyzed & Built');
            await r.save();
            console.log('✅ Updated Lead #334');
        } else if (id === '413') {
            r.set('Agency Hosted URL', 'https://www.arclanestudios.space/sites/cathy');
            r.set('Current Status', 'Analyzed & Built');
            await r.save();
            console.log('✅ Updated Lead #413');
        }
    }
    console.log('🎉 Google Sheet CRM 100% synchronized!');
}

finishSync().catch(console.error);

