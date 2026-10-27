import fs from 'fs';
import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config();

const creds = JSON.parse(fs.readFileSync(process.env.SERVICE_ACCOUNT_FILE));
const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly']
});

const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });

async function fixHeaders() {
    const sheetName = process.env.SPREADSHEET_NAME || 'Google Maps Leads';
    const driveRes = await drive.files.list({
        q: `name='${sheetName}' and mimeType='application/vnd.google-apps.spreadsheet'`,
        fields: 'files(id, name)'
    });
    if (!driveRes.data.files || driveRes.data.files.length === 0) {
        throw new Error(`Spreadsheet "${sheetName}" not found`);
    }
    const spreadsheetId = driveRes.data.files[0].id;

    // Get current sheet title & row 1 values
    const metaRes = await sheets.spreadsheets.get({ spreadsheetId });
    const title = process.env.WORKSHEET_NAME || metaRes.data.sheets[0].properties.title;

    const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${title}!1:1`
    });
    const row1 = res.data.values ? res.data.values[0] : [];
    console.log('Current row 1 raw length:', row1.length);

    // Deduplicate headers
    const seen = new Set();
    const deduplicated = [];
    for (const h of row1) {
        const trimmed = (h || '').trim();
        if (!trimmed) continue;
        if (!seen.has(trimmed)) {
            seen.add(trimmed);
            deduplicated.push(trimmed);
        } else {
            console.log('Detected & removing duplicate header:', trimmed);
        }
    }

    console.log('Clean deduplicated headers count:', deduplicated.length);

    // Clear entire row 1
    await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${title}!1:1`
    });

    // Write back clean headers
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: [deduplicated]
        }
    });

    console.log('✅ Clean unique headers successfully written to Google Sheet!');
}

fixHeaders().catch(e => { console.error('Fix error:', e); process.exit(1); });
