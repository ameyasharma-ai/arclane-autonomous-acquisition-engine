import dotenv from 'dotenv';
dotenv.config();
import { loadGoogleSheet } from '../src/sheets.js';

async function fixSheet() {
    console.log("Connecting to Google Sheet to fix coerced rows...");
    const { sheet } = await loadGoogleSheet();
    await sheet.loadCells('A1:AT525');

    const headers = sheet.headerValues;
    const dateCol = headers.indexOf('Date Added');
    const idCol = headers.indexOf('Client ID');
    const phoneCol = headers.indexOf('Phone/WhatsApp');
    const ratingCol = headers.indexOf('Ratings');
    const reviewCol = headers.indexOf('Number Of Reviews');

    let fixedCount = 0;

    for (let r = 1; r < sheet.rowCount && r < 525; r++) {
        const idCell = sheet.getCell(r, idCol);
        if (!idCell.value) continue;

        const idNum = parseInt(idCell.value, 10);
        const dateCell = sheet.getCell(r, dateCol);

        // If Date Added is a number (e.g. 46088 or 46121), restore formatted string
        if (typeof dateCell.value === 'number') {
            const formattedDate = dateCell.formattedValue || (idNum <= 100 ? '7/3/26' : '9/4/26');
            dateCell.value = formattedDate;

            // Ensure Client ID is consistent string
            idCell.value = String(idNum);

            // Ensure Ratings is string if numeric
            if (ratingCol !== -1) {
                const ratCell = sheet.getCell(r, ratingCol);
                if (typeof ratCell.value === 'number') {
                    ratCell.value = String(ratCell.value);
                }
            }

            // Ensure Reviews is string if numeric
            if (reviewCol !== -1) {
                const revCell = sheet.getCell(r, reviewCol);
                if (typeof revCell.value === 'number') {
                    revCell.value = String(revCell.value);
                }
            }

            // Ensure Phone is string with leading 0 / format
            if (phoneCol !== -1) {
                const phoneCell = sheet.getCell(r, phoneCol);
                if (typeof phoneCell.value === 'number') {
                    phoneCell.value = String(phoneCell.value);
                }
            }

            fixedCount++;
            console.log(`Fixed Row ${r + 1} (Client ID: ${idNum}) -> Restored Date Added to "${formattedDate}"`);
        }
    }

    if (fixedCount > 0) {
        await sheet.saveUpdatedCells();
        console.log(`🎉 Successfully repaired ${fixedCount} corrupted rows in Google Sheet!`);
    } else {
        console.log("No corrupted date rows found.");
    }
}

fixSheet().catch(console.error);
