import { loadGoogleSheet, highlightCell } from '../src/sheets.js';
import fs from 'fs';
import path from 'path';

export const NEW_CRM_HEADERS = [
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
    // Preserved extended columns
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

async function migrateLiveCrm() {
    console.log('====================================================');
    console.log('🚀 STARTING LIVE CRM MIGRATION TO NEW SCHEMA');
    console.log('====================================================\n');

    const { sheet, doc } = await loadGoogleSheet();
    console.log(`[GoogleSheet] Connected to: "${doc.title}", Sheet: "${sheet.title}"`);

    // 1. Fetch live rows to verify count
    const liveRows = await sheet.getRows();
    console.log(`[GoogleSheet] Read ${liveRows.length} existing rows from Sheet.`);

    // 2. Load latest confirmed snapshot
    const snapshotPath = path.join(process.cwd(), 'data', 'crm_exports', 'crm_snapshot_latest.json');
    const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    console.log(`[Snapshot] Read ${data.length} records from verified snapshot.`);

    if (liveRows.length !== data.length) {
        throw new Error(`Safety mismatch: Live rows (${liveRows.length}) !== Snapshot records (${data.length})`);
    }

    // 3. Transform all 250 records
    const transformedRows = [];
    const redHighlightIndices = []; // row index (1-based in sheet, header is row 1, first data is row 2)

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

        // Format aggregated Socials
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
            redHighlightIndices.push(idx + 1); // 1-based index (header is 0, first data is 1 in highlightCell)
        }
    });

    // 4. Create new Live tab with exact schema
    const newTabTitle = 'CRM_Leads';
    console.log(`[GoogleSheet] Creating clean migration sheet tab: "${newTabTitle}"...`);
    const newSheet = await doc.addSheet({
        title: newTabTitle,
        gridProperties: {
            rowCount: 350,
            columnCount: NEW_CRM_HEADERS.length + 5
        },
        headerValues: NEW_CRM_HEADERS
    });

    // 5. Add all rows in chunks
    console.log(`[GoogleSheet] Inserting ${transformedRows.length} transformed rows into "${newTabTitle}"...`);
    const CHUNK_SIZE = 50;
    for (let i = 0; i < transformedRows.length; i += CHUNK_SIZE) {
        const chunk = transformedRows.slice(i, i + CHUNK_SIZE);
        await newSheet.addRows(chunk);
        console.log(`  -> Synced rows ${i + 1} to ${Math.min(i + CHUNK_SIZE, transformedRows.length)}`);
    }

    // 6. Apply Red highlights to Existing Website column
    console.log(`[GoogleSheet] Applying red styling to Existing Website column (${redHighlightIndices.length} leads)...`);
    const existColIdx = NEW_CRM_HEADERS.indexOf('Existing Website');
    for (const rowIdx of redHighlightIndices) {
        await highlightCell(newSheet, doc, rowIdx, existColIdx);
    }

    // 7. Verification checks on new sheet
    const checkRows = await newSheet.getRows();
    console.log(`[Verification] Verified row count: ${checkRows.length} (Expected: ${transformedRows.length})`);
    if (checkRows.length !== transformedRows.length) {
        throw new Error('Verification failure: Row count does not match!');
    }

    // Verify sample lead #2
    const lead2 = checkRows.find(r => r.get('Client ID') == '2');
    console.log('  -> Lead #2 Agency Hosted URL:', lead2.get('Agency Hosted URL'));
    console.log('  -> Lead #2 Existing Website:', lead2.get('Existing Website'));
    if (lead2.get('Agency Hosted URL') !== 'https://www.arclanestudios.space/sites/populardineout') {
        throw new Error('Verification failed: Lead #2 Agency Hosted URL');
    }
    if (lead2.get('Existing Website') !== 'https://populardineout.github.io/') {
        throw new Error('Verification failed: Lead #2 Existing Website');
    }

    // 8. Swap tabs: Rename Sheet1 -> Sheet1_Backup_Legacy, Rename CRM_Leads -> Sheet1
    console.log('\n[GoogleSheet] Performing atomic tab swap:');
    const legacyTitle = 'Sheet1_Legacy_Backup';
    console.log(`  -> Renaming old "${sheet.title}" to "${legacyTitle}"`);
    await sheet.updateProperties({ title: legacyTitle });

    console.log(`  -> Renaming new "${newTabTitle}" to "Sheet1"`);
    await newSheet.updateProperties({ title: 'Sheet1' });

    console.log('\n🎉 CRM SCHEMA MIGRATION SUCCESSFULLY COMPLETED!');
}

migrateLiveCrm().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});

