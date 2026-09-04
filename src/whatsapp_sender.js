import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { loadGoogleSheet } from './sheets.js';
import { ContactManager } from './contacts.js';

export class WhatsAppSender {
    constructor(telegramBot, chatId) {
        this.telegramBot = telegramBot;
        this.chatId = chatId;
        this.context = null;
        this.page = null;
        this.reportsDir = path.join(process.cwd(), 'reports');
        this.sessionDir = path.join(process.cwd(), 'whatsapp_user_session');
        this.contactManager = new ContactManager();
    }

    async sendStatus(msg) {
        console.log(`[WhatsApp] ${msg}`);
        if (this.telegramBot && this.chatId) {
            try {
                await this.telegramBot.telegram.sendMessage(this.chatId, msg);
            } catch (e) {
                console.error("Failed to send telegram message:", e.message);
            }
        }
    }

    extractContactPhone(content) {
        if (!content) return null;
        
        // 1. Try explicit WhatsApp number
        const waMatch = content.match(/WhatsApp:\s*([^\n\r]+)/i);
        if (waMatch) {
            const val = waMatch[1].trim();
            if (val && !val.toLowerCase().includes('not available') && !val.toLowerCase().includes('n/a')) {
                return val;
            }
        }

        // 2. Fallback to Phone number assuming it can be a WhatsApp number
        const phoneMatch = content.match(/Phone:\s*([^\n\r]+)/i);
        if (phoneMatch) {
            const val = phoneMatch[1].trim();
            if (val && !val.toLowerCase().includes('not available') && !val.toLowerCase().includes('n/a')) {
                return val;
            }
        }

        return null;
    }

    async exportContacts(startId, endId) {
        const contactList = [];
        for (let clientId = startId; clientId <= endId; clientId++) {
            const finalPath = path.join(this.reportsDir, `final_${clientId}.txt`);
            const basePath = path.join(this.reportsDir, `${clientId}.txt`);
            
            let content = "";
            if (fs.existsSync(finalPath)) {
                content = fs.readFileSync(finalPath, 'utf-8');
            } else if (fs.existsSync(basePath)) {
                content = fs.readFileSync(basePath, 'utf-8');
            } else {
                continue;
            }

            const phone = this.extractContactPhone(content);
            const emailMatch = content.match(/Email:\s*([^\n\r]+)/i);

            let businessName = `Client ${clientId}`;
            if (fs.existsSync(basePath)) {
                const baseContent = fs.readFileSync(basePath, 'utf-8');
                const baseNameMatch = baseContent.match(/\*\*Business Name:\*\*\s*(.+)/i) || baseContent.match(/REPORT:\s*(.+)/i);
                if (baseNameMatch) {
                    businessName = baseNameMatch[1].replace(/[*#]/g, '').trim();
                }
            } else {
                const subjectMatch = content.match(/Subject:.*?(?:for|concept for|demo for)\s*(.+?)(?:\s*[–\-]|\s*in\s+Patna|\s*in\s+Pune|$)/i);
                if (subjectMatch) {
                    businessName = subjectMatch[1].replace(/[*#]/g, '').trim();
                }
            }

            const email = emailMatch && !emailMatch[1].toLowerCase().includes('not available') ? emailMatch[1].trim() : null;

            if (phone) {
                contactList.push({ clientId, businessName, phone, email });
            }
        }

        if (contactList.length > 0) {
            const vcfPath = this.contactManager.generateVCF(contactList);
            const csvPath = this.contactManager.generateCSV(contactList);

            if (this.telegramBot && this.chatId) {
                try {
                    await this.telegramBot.telegram.sendDocument(
                        this.chatId, 
                        { source: vcfPath, filename: `contacts_${startId}_${endId}.vcf` },
                        { 
                            caption: `📇 *Saved ${contactList.length} Contacts with Business Names!*\n\n` +
                                     `💡 *Anti-Ban Protection:* Tap this file on your phone to add all leads into your phone contacts before sending messages!`,
                            parse_mode: 'Markdown'
                        }
                    );
                } catch (docErr) {
                    console.error("Failed to send vcf document:", docErr.message);
                }
            }
            return { vcfPath, csvPath, count: contactList.length, contacts: contactList };
        }
        return null;
    }

    async init(headless = false) {
        if (this.context && this.page) return;

        if (!fs.existsSync(this.sessionDir)) {
            fs.mkdirSync(this.sessionDir, { recursive: true });
        }

        console.log(`[WhatsApp] Launching Official Chrome with persistent profile...`);
        this.context = await chromium.launchPersistentContext(this.sessionDir, {
            headless: headless,
            channel: 'chrome',
            viewport: null, // Full-screen window without grey margins
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-infobars',
                '--start-maximized'
            ]
        });

        this.page = this.context.pages().length > 0 ? this.context.pages()[0] : await this.context.newPage();
        
        console.log("[WhatsApp] Navigating to WhatsApp Web...");
        await this.page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Wait for chats or QR code
        try {
            await this.page.waitForSelector('#side, div[id="side"], canvas, div[data-tab="3"], div[contenteditable="true"]', { timeout: 60000 });
            
            const isQrPresent = await this.page.$('canvas');
            if (isQrPresent) {
                console.log("[WhatsApp] QR Code detected. Capturing screenshot for Telegram...");
                try {
                    const qrBuffer = await isQrPresent.screenshot();
                    if (this.telegramBot && this.chatId) {
                        await this.telegramBot.telegram.sendPhoto(
                            this.chatId, 
                            { source: qrBuffer },
                            { 
                                caption: "📱 *WhatsApp Login QR Code*\n\n1. Open WhatsApp on your phone\n2. Go to **Settings -> Linked Devices -> Link a Device**\n3. Scan this QR code to log in!",
                                parse_mode: 'Markdown'
                            }
                        );
                    }
                } catch (qrErr) {
                    console.log("QR Screenshot notice:", qrErr.message);
                }
                
                // Wait for login after scanning
                await this.page.waitForSelector('#side, div[id="side"], div[data-tab="3"], div[contenteditable="true"]', { timeout: 120000 });
                console.log("[WhatsApp] ✅ WhatsApp Web session successfully authenticated!");
                await this.sendStatus("✅ *WhatsApp Web Successfully Linked & Ready!*");
            } else {
                console.log("[WhatsApp] ✅ WhatsApp Web session is already logged in and ready!");
            }
        } catch (e) {
            console.log("[WhatsApp] Interface check notice:", e.message);
        }
    }

    cleanPhoneNumber(phoneStr) {
        if (!phoneStr) return null;
        let digits = phoneStr.replace(/\D/g, '');
        
        // If starts with 910 and has 13 digits (e.g. +91 020 66020121 -> 912066020121)
        if (digits.startsWith('910') && digits.length === 13) {
            digits = '91' + digits.substring(3);
        }
        // If starts with 0 and has 11 digits (e.g. 09031002808 -> 919031002808 or 02066020121 -> 912066020121)
        else if (digits.startsWith('0') && digits.length === 11) {
            digits = '91' + digits.substring(1);
        }
        // If 10 digits (e.g. 9801503503 -> 919801503503 or 2066020121 -> 912066020121)
        else if (digits.length === 10) {
            digits = '91' + digits;
        }
        return digits.length >= 10 ? digits : null;
    }

    async sendSingleMessage(phoneNumber, messageText) {
        const cleanPhone = this.cleanPhoneNumber(phoneNumber);
        if (!cleanPhone) {
            return { success: false, reason: `Invalid phone number format: "${phoneNumber}"` };
        }

        const targetUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}`;

        try {
            console.log(`[WhatsApp] Navigating to chat with ${cleanPhone}...`);
            await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // Wait for message box or invalid phone modal
            await this.page.waitForSelector('footer div[contenteditable="true"], div[data-tab="10"], div[data-tab="6"], span[data-icon="send"], button[aria-label="Send"], div[data-animate-modal-popup="true"]', { timeout: 45000 });

            // Check if invalid popup appeared
            const isInvalid = await this.page.$('div[data-animate-modal-popup="true"]');
            if (isInvalid) {
                const modalText = await isInvalid.innerText().catch(() => '');
                if (modalText.includes('invalid') || modalText.includes('phone number')) {
                    const okBtn = await this.page.$('button[data-animate-modal-popup-button="true"], div[role="button"]:has-text("OK")');
                    if (okBtn) await okBtn.click().catch(() => {});
                    return { success: false, reason: `Phone number +${cleanPhone} is not registered on WhatsApp.` };
                }
            }

            // Wait for input composer and focus it
            const composer = await this.page.waitForSelector('footer div[contenteditable="true"], div[data-tab="10"], div[data-tab="6"]', { timeout: 45000 });
            await composer.focus();
            await this.page.waitForTimeout(500);

            // Paste entire multi-line message cleanly via Clipboard paste event (including full https:// links)
            await this.page.evaluate((text) => {
                const composerEl = document.querySelector('footer div[contenteditable="true"]');
                if (composerEl) {
                    composerEl.focus();
                    const dataTransfer = new DataTransfer();
                    dataTransfer.setData('text/plain', text);
                    const event = new ClipboardEvent('paste', {
                        clipboardData: dataTransfer,
                        bubbles: true,
                        cancelable: true
                    });
                    composerEl.dispatchEvent(event);
                }
            }, messageText);

            await this.page.waitForTimeout(1200);

            // Dismiss any preview banner if generated
            try {
                const closeBtn = await this.page.$(
                    'button[aria-label="Close preview"], ' +
                    'div[role="button"][aria-label="Close preview"], ' +
                    'div[data-testid="link-preview"] button, ' +
                    'div[data-testid="link-preview"] span[data-icon="x"], ' +
                    'div[data-testid="media-preview-close-btn"], ' +
                    'button:has(span[data-icon="x"]), ' +
                    'div[role="button"]:has(span[data-icon="x"]), ' +
                    'span[data-icon="x"]'
                );
                if (closeBtn) {
                    console.log("[WhatsApp] ✕ Dismissed link preview banner!");
                    await closeBtn.click().catch(() => {});
                    await this.page.waitForTimeout(500);
                }
            } catch (pErr) {}

            // Click send button or press Enter
            const sendButton = await this.page.$('span[data-icon="send"], button[aria-label="Send"], span[data-icon="wds-ic-send-filled"]');
            if (sendButton) {
                await sendButton.click();
            } else {
                await this.page.keyboard.press('Enter');
            }

            // Wait for message to be sent
            await this.page.waitForTimeout(3500);
            console.log(`[WhatsApp] ✅ Message successfully sent to +${cleanPhone}`);
            return { success: true, phone: cleanPhone };
        } catch (err) {
            return { success: false, reason: err.message };
        }
    }

    async sendRange(startId, endId, options = {}) {
        await this.sendStatus(`🚀 *Initiating WhatsApp Dispatch for Range [${startId}:${endId}]...*`);
        
        // Auto-export contacts with business names to vCard unless skipped
        if (!options.skipExport) {
            await this.exportContacts(startId, endId);
        }

        await this.init(false);

        let successCount = 0;
        let failCount = 0;

        for (let clientId = startId; clientId <= endId; clientId++) {
            // 1. Read final report or base report
            const finalPath = path.join(this.reportsDir, `final_${clientId}.txt`);
            const basePath = path.join(this.reportsDir, `${clientId}.txt`);
            
            let content = "";
            if (fs.existsSync(finalPath)) {
                content = fs.readFileSync(finalPath, 'utf-8');
            } else if (fs.existsSync(basePath)) {
                content = fs.readFileSync(basePath, 'utf-8');
            } else {
                await this.sendStatus(`⚠️ *Client ${clientId}:* Report not found in \`reports/\`. Skipping.`);
                failCount++;
                continue;
            }

            // 2. Extract Phone / WhatsApp (fallback to Phone if WhatsApp missing)
            const targetPhone = this.extractContactPhone(content);

            // 3. Extract WhatsApp Message
            let waMessage = "";
            const waMatch = content.match(/\[WHATSAPP_START\]([\s\S]*?)\[WHATSAPP_END\]/i);
            if (waMatch) {
                waMessage = waMatch[1].trim();
            }

            if (!targetPhone || !waMessage) {
                await this.sendStatus(`⚠️ *Client ${clientId}:* No valid WhatsApp/Phone contact or message found. Skipping.`);
                failCount++;
                continue;
            }

            await this.sendStatus(`📲 *[Client ${clientId}] Sending WhatsApp message to ${targetPhone}...*`);

            const sendResult = await this.sendSingleMessage(targetPhone, waMessage);

            if (sendResult.success) {
                successCount++;
                await this.sendStatus(`✅ *[Client ${clientId}] Sent Successfully to +${sendResult.phone}!*`);
                
                // Update Google Sheet
                try {
                    const { sheet } = await loadGoogleSheet();
                    const rows = await sheet.getRows();
                    const targetRow = rows.find(r => parseInt(r.toObject()['Client ID'], 10) === clientId);
                    if (targetRow) {
                        targetRow.set('Outreach Platform', 'WhatsApp-Sent');
                        await targetRow.save();
                    }
                } catch (sheetErr) {
                    console.error("Sheet update notice:", sheetErr.message);
                }

                // Anti-ban random delay (6 to 12 seconds)
                if (clientId < endId) {
                    const delaySec = Math.floor(Math.random() * 7) + 6;
                    console.log(`[WhatsApp] Waiting ${delaySec}s safety delay before next lead...`);
                    await new Promise(r => setTimeout(r, delaySec * 1000));
                }
            } else {
                failCount++;
                await this.sendStatus(`❌ *[Client ${clientId}] Failed:* ${sendResult.reason}`);
            }
        }

        await this.sendStatus(`🎉 *WhatsApp Dispatch Complete!*\n\n✅ *Sent:* ${successCount}\n❌ *Failed/Skipped:* ${failCount}`);
    }

    async close() {
        if (this.context) {
            await this.context.close();
            this.context = null;
            this.page = null;
        }
    }
}
