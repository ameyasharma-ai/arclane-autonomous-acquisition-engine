import { google } from 'googleapis';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import fs from 'fs';

export async function getSpreadsheetId(authClient, name) {
    const drive = google.drive({ version: 'v3', auth: authClient });
    const res = await drive.files.list({
        q: `name='${name}' and mimeType='application/vnd.google-apps.spreadsheet'`,
        fields: 'files(id, name)',
    });
    if (res.data.files.length === 0) {
        throw new Error(`Spreadsheet "${name}" not found`);
    }
    return res.data.files[0].id;
}

export async function loadGoogleSheet() {
    const credentials = JSON.parse(fs.readFileSync(process.env.SERVICE_ACCOUNT_FILE));
    
    const authClient = new google.auth.GoogleAuth({
        credentials,
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.readonly',
        ],
    });

    const auth = await authClient.getClient();
    const spreadsheetId = await getSpreadsheetId(auth, process.env.SPREADSHEET_NAME);

    const jwt = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(spreadsheetId, jwt);
    await doc.loadInfo();

    let sheet;
    if (process.env.WORKSHEET_NAME) {
        sheet = doc.sheetsByTitle[process.env.WORKSHEET_NAME];
    } else {
        sheet = doc.sheetsByIndex[0];
    }
    
    await sheet.loadHeaderRow();
    return { sheet, doc };
}

export async function getLeads(sheet, startId, endId, excludedIds) {
    const rows = await sheet.getRows();
    const filteredLeads = [];

    for (const row of rows) {
        const rowData = row.toObject();
        const clientIdStr = rowData['Client ID'];
        if (!clientIdStr) continue;

        const clientId = parseInt(clientIdStr, 10);
        if (isNaN(clientId)) continue;

        // Check range
        if (startId !== null && clientId < startId) continue;
        if (endId !== null && clientId > endId) continue;

        // Check excluded
        if (excludedIds && excludedIds.includes(clientId)) continue;

        // Skip if Notes cell is not empty
        if (rowData['Notes'] && rowData['Notes'].trim() !== '') continue;

        // Attach the actual row object so we can update it later
        filteredLeads.push({
            data: rowData,
            row: row,
            clientId: clientId
        });
    }

    return filteredLeads;
}

export async function updateLeadNotes(row, notesContent) {
    row.assign({ Notes: notesContent });
    await row.save();
}
