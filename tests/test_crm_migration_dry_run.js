import { loadGoogleSheet, highlightCell } from '../src/sheets.js';
import fs from 'fs';
import path from 'path';

async function testDryRun() {
    console.log('--- RUNNING DRY-RUN SIMULATION ON TEST SHEET ---');
    const { doc } = await loadGoogleSheet();
    const originalSheet = doc.sheetsByTitle['Sheet1'];
    
    // Load snapshot
    const data = JSON.parse(fs.readFileSync('data/crm_exports/crm_snapshot_latest.json', 'utf8'));
    console.log(`Loaded ${data.length} records from local snapshot.`);

    const NEW_HEADERS = [
        "Client ID",
        "Date Added",
        "Business Name",
        "Industry/Niche",
        "City/State",
        "Phone/WhatsApp",
        "Agency Hosted URL",
        "Existing Website",
        "AI Outreach Hook",
        "Current Status",
        "Priority Level",
        "Ratings",
        "Number Of Reviews",
        "Timings",
        "Socials",
        "Address",
        // Remaining headers preserved:
        "Subdomain URL",
        "Email",
        "Instagram",
        "Facebook",
        "X (Twitter)",
        "YouTube",
        "TikTok",
        "LinkedIn",
        "Maps URL",
        "Owner Name",
        "Contact Person",
        "Outreach Platform",
        "Outreach Date",
        "Follow-Up Date",
        "Interested Services",
        "Pain Points",
        "Project Type",
        "Estimated Budget",
        "Quoted Price",
        "Negotiation Status",
        "Meeting Scheduled",
        "Meeting Date",
        "Proposal Sent",
        "Contract Sent",
        "Payment Status",
        "Advance Received",
        "Final Payment",
        "Delivery Deadline",
        "Project Status",
        "Testimonials Received",
        "Referral Potential",
        "Notes",
        "Email Status"
    ];

    const testTitle = 'Test_Schema_Migration_' + Date.now();
    console.log(`Creating sandbox sheet: ${testTitle}`);
    const testSheet = await doc.addSheet({
        title: testTitle,
        gridProperties: {
            rowCount: 300,
            columnCount: NEW_HEADERS.length + 5
        },
        headerValues: NEW_HEADERS
    });

    console.log('Transforming records for new schema...');
    const transformedRows = [];
    const redHighlightIndices = []; // row index in sheet (0-based)

    data.forEach((r, idx) => {
        let cleanAgency = (r['Agency Hosted URL'] || '').trim();
        let existingWeb = (r['Website URL'] || '').trim();
        let isRed = false;

        if (cleanAgency.includes('|')) {
            const parts = cleanAgency.split('|').map(s => s.trim());
            existingWeb = parts[0];
            cleanAgency = parts[1];
            isRed = true;
        } else if (existingWeb.includes('arclanestudios.space')) {
            existingWeb = '';
        }

        if (r['Client ID'] === '5') {
            isRed = true;
        }

        // Format Socials
        const socList = [];
        if (r.Instagram) socList.push(`IG: ${r.Instagram}`);
        if (r.Facebook) socList.push(`FB: ${r.Facebook}`);
        if (r['X (Twitter)']) socList.push(`X: ${r['X (Twitter)']}`);
        if (r.YouTube) socList.push(`YT: ${r.YouTube}`);
        if (r.TikTok) socList.push(`TT: ${r.TikTok}`);
        if (r.LinkedIn) socList.push(`IN: ${r.LinkedIn}`);
        const socialsStr = socList.join(' | ');

        const newRowObj = {
            "Client ID": r["Client ID"],
            "Date Added": r["Date Added"],
            "Business Name": r["Business Name"],
            "Industry/Niche": r["Industry/Niche"],
            "City/State": r["City/State"],
            "Phone/WhatsApp": r["Phone/WhatsApp"],
            "Agency Hosted URL": cleanAgency,
            "Existing Website": existingWeb,
            "AI Outreach Hook": r["AI Outreach Hook"],
            "Current Status": r["Current Status"],
            "Priority Level": r["Priority Level"],
            "Ratings": r["Ratings"],
            "Number Of Reviews": r["Number Of Reviews"],
            "Timings": r["Timings"],
            "Socials": socialsStr,
            "Address": r["Address"],
            "Subdomain URL": r["Subdomain URL"],
            "Email": r["Email"],
            "Instagram": r["Instagram"],
            "Facebook": r["Facebook"],
            "X (Twitter)": r["X (Twitter)"],
            "YouTube": r["YouTube"],
            "TikTok": r["TikTok"],
            "LinkedIn": r["LinkedIn"],
            "Maps URL": r["Maps URL"],
            "Owner Name": r["Owner Name"],
            "Contact Person": r["Contact Person"],
            "Outreach Platform": r["Outreach Platform"],
            "Outreach Date": r["Outreach Date"],
            "Follow-Up Date": r["Follow-Up Date"],
            "Interested Services": r["Interested Services"],
            "Pain Points": r["Pain Points"],
            "Project Type": r["Project Type"],
            "Estimated Budget": r["Estimated Budget"],
            "Quoted Price": r["Quoted Price"],
            "Negotiation Status": r["Negotiation Status"],
            "Meeting Scheduled": r["Meeting Scheduled"],
            "Meeting Date": r["Meeting Date"],
            "Proposal Sent": r["Proposal Sent"],
            "Contract Sent": r["Contract Sent"],
            "Payment Status": r["Payment Status"],
            "Advance Received": r["Advance Received"],
            "Final Payment": r["Final Payment"],
            "Delivery Deadline": r["Delivery Deadline"],
            "Project Status": r["Project Status"],
            "Testimonials Received": r["Testimonials Received"],
            "Referral Potential": r["Referral Potential"],
            "Notes": r["Notes"],
            "Email Status": r["Email Status"]
        };

        transformedRows.push(newRowObj);
        if (isRed) {
            redHighlightIndices.push(idx + 1); // 1 row offset for header
        }
    });

    console.log(`Adding ${transformedRows.length} rows in chunks...`);
    const CHUNK_SIZE = 50;
    for (let i = 0; i < transformedRows.length; i += CHUNK_SIZE) {
        const chunk = transformedRows.slice(i, i + CHUNK_SIZE);
        await testSheet.addRows(chunk);
        console.log(`  Added rows ${i + 1} to ${Math.min(i + CHUNK_SIZE, transformedRows.length)}`);
    }

    console.log(`Applying RED highlights to Existing Website column (${redHighlightIndices.length} leads)...`);
    const existColIdx = NEW_HEADERS.indexOf('Existing Website');
    for (const rowIdx of redHighlightIndices) {
        await highlightCell(testSheet, doc, rowIdx, existColIdx);
    }

    console.log('Verifying test sheet verification checks:');
    const verifyRows = await testSheet.getRows();
    console.log(`  - Total Rows: ${verifyRows.length} (Expected: 250)`);
    if (verifyRows.length !== 250) throw new Error('Row count mismatch');

    const sampleLead2 = verifyRows.find(r => r.get('Client ID') == '2');
    console.log('  - Lead #2:');
    console.log('    Agency Hosted URL:', sampleLead2.get('Agency Hosted URL'));
    console.log('    Existing Website:', sampleLead2.get('Existing Website'));
    if (sampleLead2.get('Agency Hosted URL') !== 'https://www.arclanestudios.space/sites/populardineout') {
        throw new Error('Lead #2 Agency Hosted URL mismatch!');
    }
    if (sampleLead2.get('Existing Website') !== 'https://populardineout.github.io/') {
        throw new Error('Lead #2 Existing Website mismatch!');
    }

    const sampleLead1 = verifyRows.find(r => r.get('Client ID') == '1');
    console.log('  - Lead #1:');
    console.log('    Agency Hosted URL:', sampleLead1.get('Agency Hosted URL'));
    console.log('    Existing Website:', sampleLead1.get('Existing Website') || '(blank)');
    if (sampleLead1.get('Agency Hosted URL') !== 'https://www.arclanestudios.space/sites/fitnation') {
        throw new Error('Lead #1 Agency Hosted URL mismatch!');
    }
    if (sampleLead1.get('Existing Website') !== '') {
        throw new Error('Lead #1 Existing Website should be blank!');
    }

    // Clean up test sheet
    console.log('Cleaning up sandbox test sheet...');
    await testSheet.delete();
    console.log('✅ DRY RUN COMPLETED WITH 100% SUCCESS!');
}

testDryRun().catch(err => {
    console.error('❌ Dry run failed:', err);
    process.exit(1);
});
