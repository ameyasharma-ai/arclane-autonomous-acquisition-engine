import { google } from 'googleapis';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function getSpreadsheetId(authClient, name) {
    const drive = google.drive({ version: 'v3', auth: authClient });
    const res = await drive.files.list({
        q: `name='${name}' and mimeType='application/vnd.google-apps.spreadsheet'`,
        fields: 'files(id, name)',
    });
    if (res.data.files.length === 0) {
        throw new Error('Spreadsheet not found');
    }
    return res.data.files[0].id;
}

async function run() {
    try {
        const credentials = JSON.parse(fs.readFileSync(process.env.SERVICE_ACCOUNT_FILE));
        const authClient = new google.auth.GoogleAuth({
            credentials,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive.readonly',
            ],
        });

        const auth = await authClient.getClient();
        
        console.log('Finding spreadsheet by name:', process.env.SPREADSHEET_NAME);
        const spreadsheetId = await getSpreadsheetId(auth, process.env.SPREADSHEET_NAME);
        console.log('Found ID:', spreadsheetId);

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
        console.log('Headers:', sheet.headerValues);
        
        const rows = await sheet.getRows({ limit: 1 });
        if (rows.length > 0) {
            console.log('Sample Row:', rows[0].toObject());
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

run();
