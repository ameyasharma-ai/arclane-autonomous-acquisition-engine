import fs from 'fs';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

dotenv.config();

let clockDriftMs = 0;
let isClockSynced = false;

/**
 * Automatically syncs with Google's HTTP server time to handle any local system clock drift.
 * Solves: "invalid_grant: Invalid JWT timeframe" without needing admin OS time resets.
 */
async function ensureGoogleClockSync() {
    if (isClockSynced) return;
    try {
        const headRes = await fetch('https://www.googleapis.com', { method: 'HEAD' });
        const dateHeader = headRes.headers.get('date');
        if (dateHeader) {
            const serverMs = new Date(dateHeader).getTime();
            const localMs = Date.now();
            clockDriftMs = serverMs - localMs;
            console.log(`[GoogleSheet] Synced with Google server clock (offset: ${Math.round(clockDriftMs / 1000)}s)`);
        }
    } catch (e) {
        // Continue with zero drift if offline
    }
    isClockSynced = true;
}

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
    await ensureGoogleClockSync();

    // Wrap Date during JWT signing so `new Date().getTime()` in gtoken matches Google server time
    const OrigDate = global.Date;
    if (Math.abs(clockDriftMs) > 1000) {
        function SyncedDate(...args) {
            if (args.length === 0) {
                return new OrigDate(OrigDate.now() + clockDriftMs);
            }
            return new OrigDate(...args);
        }
        SyncedDate.prototype = OrigDate.prototype;
        SyncedDate.now = () => OrigDate.now() + clockDriftMs;
        SyncedDate.parse = OrigDate.parse;
        SyncedDate.UTC = OrigDate.UTC;
        global.Date = SyncedDate;
    }

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
        
        try {
            await sheet.loadHeaderRow();
        } catch (headerErr) {
            if (headerErr.message && headerErr.message.includes('Duplicate header detected')) {
                console.warn('[GoogleSheet] Duplicate header detected, auto-sanitizing row 1...');
                const sheetsApi = google.sheets({ version: 'v4', auth });
                const title = sheet.title || 'Sheet1';
                const rowRes = await sheetsApi.spreadsheets.values.get({
                    spreadsheetId,
                    range: `${title}!1:1`
                });
                const rawHeaders = rowRes.data.values ? rowRes.data.values[0] : [];
                const seen = new Set();
                const cleanHeaders = [];
                for (const h of rawHeaders) {
                    const t = (h || '').trim();
                    if (!t) continue;
                    if (!seen.has(t)) {
                        seen.add(t);
                        cleanHeaders.push(t);
                    }
                }
                await sheetsApi.spreadsheets.values.clear({ spreadsheetId, range: `${title}!1:1` });
                await sheetsApi.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${title}!A1`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [cleanHeaders] }
                });
                await sheet.loadHeaderRow();
                console.log('[GoogleSheet] Auto-sanitized headers successfully!');
            } else {
                throw headerErr;
            }
        }
        return { sheet, doc };
    } finally {
        global.Date = OrigDate;
    }
}

export async function getLeads(sheet, startId, endId, excludedIds) {
    const rows = await sheet.getRows();
    const filteredLeads = [];
    let alreadyProcessedCount = 0;

    for (const row of rows) {
        const rawClientId = row.get('Client ID');
        const clientId = parseInt(rawClientId, 10);
        
        if (isNaN(clientId)) continue;

        if (startId !== null && startId !== undefined && clientId < startId) continue;
        if (endId !== null && endId !== undefined && clientId > endId) continue;

        if (excludedIds && excludedIds.includes(clientId)) {
            continue;
        }

        const status = (row.get('Current Status') || '').toLowerCase();
        const website = (row.get('Website URL') || '').toLowerCase();
        
        const isCompleted = 
            status.includes('analyzed') || 
            status.includes('website built') || 
            status.includes('contacted') || 
            status.includes('ready') ||
            (website && website.startsWith('http'));

        if (isCompleted) {
            alreadyProcessedCount++;
            continue;
        }

        filteredLeads.push({
            clientId,
            businessName: row.get('Business Name'),
            websiteUrl: row.get('Website URL'),
            phone: row.get('Phone/WhatsApp') || row.get('Phone') || row.get('WhatsApp') || '',
            fullAddress: row.get('Address') || row.get('Full Address') || '',
            rating: row.get('Ratings') || row.get('Rating') || '',
            totalReviews: row.get('Number Of Reviews') || row.get('Total Reviews') || '',
            rawRow: row
        });
    }

    if (alreadyProcessedCount > 0) {
        console.log(`[GoogleSheet] Skipped ${alreadyProcessedCount} already-analyzed/built leads in range.`);
    }

    return filteredLeads;
}

export async function updateLeadStatus(sheet, clientId, status) {
    return updateLeadFields(sheet, clientId, { 'Current Status': status });
}

export async function updateLeadField(sheet, clientId, field, value) {
    return updateLeadFields(sheet, clientId, { [field]: value });
}

export async function updateLeadFields(sheet, clientId, fieldsToUpdate) {
    const rows = await sheet.getRows();
    const row = rows.find(r => r.get('Client ID') == String(clientId));

    if (!row) {
        console.warn(`Lead ${clientId} not found in sheet for updating fields:`, Object.keys(fieldsToUpdate));
        return false;
    }

    for (const [key, value] of Object.entries(fieldsToUpdate)) {
        row.set(key, value);
    }
    await row.save();
    return true;
}

export async function updateLeadNotes(sheet, clientId, notes) {
    return updateLeadFields(sheet, clientId, { 'Notes': notes });
}

/**
 * Completely clear all CRM rows while preserving the header row.
 */
export async function clearCrmSheet(sheet) {
    const rows = await sheet.getRows();
    let deletedCount = 0;
    for (const row of rows) {
        await row.delete();
        deletedCount++;
    }
    return deletedCount;
}

/**
 * Clear hosted website fields (Subdomain URL, Agency Hosted URL, Status) from CRM leads.
 */
export async function clearHostedCrmFields(sheet) {
    const rows = await sheet.getRows();
    let updatedCount = 0;
    for (const row of rows) {
        let changed = false;
        if (row.get('Subdomain URL')) {
            row.set('Subdomain URL', '');
            changed = true;
        }
        if (row.get('Agency Hosted URL')) {
            row.set('Agency Hosted URL', '');
            changed = true;
        }
        if (row.get('Audit Report URL')) {
            row.set('Audit Report URL', '');
            changed = true;
        }
        if (row.get('AI Outreach Hook')) {
            row.set('AI Outreach Hook', '');
            changed = true;
        }
        const currentStatus = (row.get('Current Status') || '').toLowerCase();
        if (currentStatus.includes('website built') || currentStatus.includes('analyzed')) {
            row.set('Current Status', 'Lead Discovered');
            changed = true;
        }
        if (changed) {
            await row.save();
            updatedCount++;
        }
    }
    return updatedCount;
}
