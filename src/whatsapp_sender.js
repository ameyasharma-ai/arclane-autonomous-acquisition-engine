import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { loadGoogleSheet, updateLeadField, updateLeadFields } from './sheets.js';
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

    getClientOutreachData(clientId) {
        const clientDir = path.join(this.reportsDir, String(clientId));
        const jsonPath = path.join(clientDir, 'outreach.json');
        const txtPath = path.join(clientDir, 'outreach.txt');
        const clientFinalPath = path.join(clientDir, 'final.txt');
        const legacyFinalPath = path.join(this.reportsDir, `final_${clientId}.txt`);
        const legacyBasePath = path.join(this.reportsDir, `${clientId}.txt`);
        const auditMdPath = path.join(clientDir, 'audit.md');

        if (fs.existsSync(jsonPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                return {
                    businessName: data.businessName || `Client ${clientId}`,
                    phone: data.whatsapp || data.phone || '',
                    waMessage: data.whatsappMessage || '',
                    callScript: data.callScript || '',
                    deployedUrl: data.deployedUrl || ''
                };
            } catch (e) {}
        }

        let content = "";
        if (fs.existsSync(txtPath)) {
            content = fs.readFileSync(txtPath, 'utf-8');
        } else if (fs.existsSync(clientFinalPath)) {
            content = fs.readFileSync(clientFinalPath, 'utf-8');
        } else if (fs.existsSync(legacyFinalPath)) {
            content = fs.readFileSync(legacyFinalPath, 'utf-8');
        } else if (fs.existsSync(auditMdPath)) {
            content = fs.readFileSync(auditMdPath, 'utf-8');
        } else if (fs.existsSync(legacyBasePath)) {
            content = fs.readFileSync(legacyBasePath, 'utf-8');
        }

        if (!content) return null;

        const phone = this.extractContactPhone(content);
        let waMessage = "";
        const waMatch = content.match(/\[WHATSAPP_START\]([\s\S]*?)\[WHATSAPP_END\]/i);
        if (waMatch) waMessage = waMatch[1].trim();

        let businessName = `Client ${clientId}`;
        const nameMatch = content.match(/\*\*Business Name:\*\*\s*(.+)/i) || content.match(/REPORT:\s*(.+)/i);
        if (nameMatch) {
            businessName = nameMatch[1].replace(/[*#]/g, '').trim();
        }

        return { businessName, phone, waMessage, content };
    }

    async exportContacts(startId, endId) {
        const contactList = [];
        for (let clientId = startId; clientId <= endId; clientId++) {
            const data = this.getClientOutreachData(clientId);
            if (!data) continue;

            const phone = data.phone;
            const businessName = data.businessName;

            if (phone) {
                contactList.push({ clientId, businessName, phone, email: null });
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

    async dismissAnyModal() {
        try {
            if (!this.page) return;
            const buttons = await this.page.$$(
                'div[role="dialog"] button, ' +
                'div[role="alertdialog"] button, ' +
                'div[data-animate-modal-popup="true"] button, ' +
                'button[data-animate-modal-popup-button="true"], ' +
                'button:has-text("OK"), ' +
                'div[role="button"]:has-text("OK"), ' +
                'button:has-text("Ok"), ' +
                'div[role="button"]:has-text("Ok")'
            );
            for (const btn of buttons) {
                const isVis = await btn.isVisible().catch(() => false);
                if (isVis) {
                    console.log("[WhatsApp] Dismissing popup modal...");
                    await btn.click().catch(() => {});
                    await this.page.waitForTimeout(300);
                }
            }
        } catch (e) {}
    }

    markContactAsPhoneOnly(clientId, phoneNumber) {
        const clientDir = path.join(this.reportsDir, String(clientId));
        const jsonPath = path.join(clientDir, 'outreach.json');
        const txtPath = path.join(clientDir, 'outreach.txt');
        const finalPath = path.join(clientDir, 'final.txt');
        const auditPath = path.join(clientDir, 'audit.md');

        if (fs.existsSync(jsonPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                data.whatsappStatus = 'Not registered on WhatsApp (Phone-only)';
                data.hasWhatsApp = false;
                data.updatedAt = new Date().toISOString();
                fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
            } catch (e) {}
        }

        const noticeHeader = `[STATUS_NOTICE]\n⚠️ THIS CONTACT HAS ONLY PHONE AVAILABLE WITH NO WHATSAPP.\n(Attempted WhatsApp outreach to ${phoneNumber || 'number'} failed: Number is not registered on WhatsApp. Outreach must be conducted via direct phone call).\n\n`;

        const updateFile = (filePath) => {
            if (fs.existsSync(filePath)) {
                let content = fs.readFileSync(filePath, 'utf-8');
                if (content.includes('[STATUS_NOTICE]')) {
                    content = content.replace(/\[STATUS_NOTICE\][\s\S]*?\n\n/, noticeHeader);
                } else {
                    content = noticeHeader + content;
                }
                content = content.replace(/WhatsApp:\s*([^\n\r]+)/i, `WhatsApp: Not registered on WhatsApp (Phone-only contact: ${phoneNumber || 'call only'})`);
                fs.writeFileSync(filePath, content, 'utf-8');
                console.log(`[WhatsApp] 📝 Added phone-only notice at top of ${path.basename(filePath)}`);
            }
        };

        updateFile(txtPath);
        updateFile(finalPath);
        updateFile(auditPath);
    }

    async sendSingleMessage(phoneNumber, messageText) {
        const cleanPhone = this.cleanPhoneNumber(phoneNumber);
        if (!cleanPhone) {
            return { success: false, notOnWhatsApp: true, reason: `Invalid phone number format: "${phoneNumber}"` };
        }

        const targetUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}`;

        try {
            // Dismiss any old modal before starting new chat
            await this.dismissAnyModal();

            console.log(`[WhatsApp] Navigating to chat with ${cleanPhone}...`);
            await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // Poll for either message composer or invalid modal for up to 25 seconds
            let isComposerReady = false;
            let isNotRegistered = false;
            let failureReason = null;

            const startTime = Date.now();
            while (Date.now() - startTime < 25000) {
                // 1. Check if input composer is ready
                const composer = await this.page.$('footer div[contenteditable="true"], div[data-tab="10"], div[data-tab="6"], div[title="Type a message"]');
                if (composer) {
                    const isVis = await composer.isVisible().catch(() => false);
                    if (isVis) {
                        isComposerReady = true;
                        break;
                    }
                }

                // 2. Check for invalid phone popup / modal
                const dialogs = await this.page.$$(
                    'div[role="dialog"], ' +
                    'div[role="alertdialog"], ' +
                    'div[data-animate-modal-popup="true"], ' +
                    'div[aria-modal="true"], ' +
                    'div[data-testid="popup-contents"]'
                );

                for (const dialog of dialogs) {
                    const isVis = await dialog.isVisible().catch(() => false);
                    if (isVis) {
                        const modalText = await dialog.innerText().catch(() => '');
                        if (
                            modalText.toLowerCase().includes('invalid') || 
                            modalText.toLowerCase().includes('phone number') || 
                            modalText.toLowerCase().includes('url is invalid') ||
                            modalText.toLowerCase().includes('not on whatsapp')
                        ) {
                            isNotRegistered = true;
                            failureReason = `Phone number +${cleanPhone} is not registered on WhatsApp.`;
                            break;
                        }
                    }
                }

                if (isNotRegistered) break;

                // 3. Fallback text check on entire page
                const bodyText = await this.page.evaluate(() => document.body ? document.body.innerText : '').catch(() => '');
                if (bodyText.includes('Phone number shared via url is invalid') || bodyText.includes('invalid phone number')) {
                    isNotRegistered = true;
                    failureReason = `Phone number +${cleanPhone} is not registered on WhatsApp.`;
                    break;
                }

                await this.page.waitForTimeout(800);
            }

            // Handle non-registered number
            if (isNotRegistered || !isComposerReady) {
                await this.dismissAnyModal();
                console.log(`[WhatsApp] ⚠️ +${cleanPhone} is not registered on WhatsApp or chat could not be loaded.`);
                return {
                    success: false,
                    notOnWhatsApp: true,
                    phone: cleanPhone,
                    reason: failureReason || `Phone number +${cleanPhone} is not registered on WhatsApp.`
                };
            }

            // Composer is ready: focus and paste message
            const composer = await this.page.waitForSelector('footer div[contenteditable="true"], div[data-tab="10"], div[data-tab="6"]', { timeout: 10000 });
            await composer.focus();
            await this.page.waitForTimeout(500);

            // Paste entire multi-line message cleanly via Clipboard paste event
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
            await this.dismissAnyModal();
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
            const data = this.getClientOutreachData(clientId);
            if (!data) {
                await this.sendStatus(`⚠️ *Client ${clientId}:* Report/Outreach file not found in \`reports/\`. Skipping.`);
                failCount++;
                continue;
            }

            const targetPhone = data.phone;
            const waMessage = data.waMessage;

            if (!targetPhone || !waMessage) {
                await this.sendStatus(`⚠️ *Client ${clientId}:* No valid WhatsApp/Phone contact or message found. Skipping.`);
                failCount++;
                continue;
            }

            await this.sendStatus(`📲 *[Client ${clientId} - ${data.businessName}] Sending WhatsApp message to ${targetPhone}...*`);

            const sendResult = await this.sendSingleMessage(targetPhone, waMessage);

            if (sendResult.success) {
                successCount++;
                await this.sendStatus(`✅ *[Client ${clientId}] Sent Successfully to +${sendResult.phone}!*`);
                
                // Calculate Outreach Date & Tentative Follow-up Date (+3 days)
                const now = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                const outreachDate = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
                const followUp = new Date(now);
                followUp.setDate(now.getDate() + 3);
                const followUpDate = `${pad(followUp.getDate())}/${pad(followUp.getMonth() + 1)}/${followUp.getFullYear()}`;

                // Update Google Sheet safely (Outreach Platform, Outreach Date, Follow-Up Date, Current Status)
                try {
                    const { sheet } = await loadGoogleSheet();
                    await updateLeadFields(sheet, clientId, {
                        'Outreach Platform': 'WhatsApp-Sent',
                        'Outreach Date': outreachDate,
                        'Follow-Up Date': followUpDate,
                        'Current Status': 'Contacted'
                    });
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
                
                // If number is not on WhatsApp, update report file and alert on Telegram
                if (sendResult.notOnWhatsApp || sendResult.reason?.toLowerCase().includes('not registered') || sendResult.reason?.toLowerCase().includes('invalid')) {
                    this.markContactAsPhoneOnly(clientId, targetPhone);
                    
                    await this.sendStatus(
                        `⚠️ *[Client ${clientId}] Outreach Notice: No WhatsApp Account*\n\n` +
                        `📞 *Phone Number:* \`${targetPhone}\` is *NOT registered on WhatsApp*.\n` +
                        `📌 *Status:* Contact has *ONLY PHONE AVAILABLE* with no WhatsApp.\n` +
                        `📝 *Report Updated:* Added phone-only alert in \`reports/${clientId}/outreach.json\`.\n` +
                        `💡 *Next Step:* Outreach must be conducted via direct phone call.`
                    );

                    // Update Google Sheet safely
                    try {
                        const { sheet } = await loadGoogleSheet();
                        await updateLeadFields(sheet, clientId, {
                            'Outreach Platform': 'Phone-Only (No WhatsApp)',
                            'Current Status': 'Requires Phone Call'
                        });
                    } catch (sheetErr) {
                        console.error("Sheet update notice:", sheetErr.message);
                    }
                } else {
                    await this.sendStatus(`❌ *[Client ${clientId}] Failed:* ${sendResult.reason || 'Unknown error'}`);
                }
            }
        }

        await this.sendStatus(`🎉 *WhatsApp Dispatch Complete!*\n\n✅ *Sent:* ${successCount}\n❌ *Failed/Skipped/Phone-Only:* ${failCount}`);
    }

    async close() {
        if (this.context) {
            await this.context.close();
            this.context = null;
            this.page = null;
        }
    }
}
