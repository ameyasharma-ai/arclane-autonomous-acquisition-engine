import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { loadGoogleSheet, getLeads } from './sheets.js';
import { Orchestrator } from './orchestrator.js';
import { WebsiteBuilder } from './builder.js';
import { WhatsAppSender } from './whatsapp_sender.js';

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
let currentOrchestrator = null;

bot.start((ctx) => ctx.reply(
    '🤖 *Welcome to CRM Enrichment, Website Builder & WhatsApp Sender Bot!*\n\n' +
    'Commands:\n' +
    '• `/analyse --range [x:y]` - Run complete end-to-end analysis & website build\n' +
    '• `/send [x:y]` - Automatically dispatch WhatsApp messages to leads\n' +
    '• `/login` - Open browser window to scan WhatsApp Web QR code\n' +
    '• `build_<id>.txt` or `/build <id>` - Manually build/rebuild website\n' +
    '• `/pause`, `/resume`, `/stop` - Control analysis pipeline',
    { parse_mode: 'Markdown' }
));

// Handler for /send [x:y] or /send <id>
async function handleSendRequest(ctx, text) {
    let startId = null;
    let endId = null;

    const rangeMatch = text.match(/(?:\/send|send)\s*\[?(\d+)\s*:\s*(\d+)\]?/i);
    if (rangeMatch) {
        startId = parseInt(rangeMatch[1], 10);
        endId = parseInt(rangeMatch[2], 10);
    } else {
        const singleMatch = text.match(/(?:\/send|send)\s*\[?(\d+)\]?/i);
        if (singleMatch) {
            startId = parseInt(singleMatch[1], 10);
            endId = startId;
        }
    }

    if (startId === null || endId === null) {
        return ctx.reply("❌ Invalid format. Use `/send [x:y]` (e.g. `/send [1:5]`) or `/send <id>` (e.g. `/send 511`).", { parse_mode: 'Markdown' });
    }

    console.log(`\n==================================================`);
    console.log(`[Bot] 📲 Incoming WhatsApp Send Request -> Range: [${startId}:${endId}]`);
    console.log(`==================================================`);

    await ctx.reply(`📇 Preparing contacts & vCard for Range [${startId}:${endId}]...`);

    const sender = new WhatsAppSender(bot, ctx.chat.id);
    const exportResult = await sender.exportContacts(startId, endId);

    if (!exportResult || exportResult.count === 0) {
        return ctx.reply(`⚠️ No valid contacts found for Range [${startId}:${endId}]. Please check that the reports exist in \`reports/\`.`);
    }

    const labelRange = startId === endId ? `Client ${startId}` : `Clients [${startId}:${endId}]`;

    await ctx.reply(
        `⏸ *Outreach Paused: Contact vCard Ready*\n\n` +
        `📇 *${exportResult.count} contact(s) exported for ${labelRange}.*\n\n` +
        `📱 *Instructions:*\n` +
        `1. Open the \`.vcf\` file sent above on your phone.\n` +
        `2. Tap *Save / Import All Contacts* into your phone's address book.\n` +
        `3. When you're ready to dispatch, tap the button below to start sending!`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `🚀 Start Sending WhatsApp Messages`, callback_data: `start_send_${startId}_${endId}` }
                    ]
                ]
            }
        }
    );
}

bot.action(/^start_send_(\d+)_(\d+)$/, async (ctx) => {
    const startId = parseInt(ctx.match[1], 10);
    const endId = parseInt(ctx.match[2], 10);

    try {
        await ctx.answerCbQuery("🚀 Resuming WhatsApp dispatch...");
    } catch (e) {}

    try {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch (e) {}

    const labelRange = startId === endId ? `Client ${startId}` : `Range [${startId}:${endId}]`;
    await ctx.reply(`▶️ *Resuming Dispatch for ${labelRange}...* Launching browser!`, { parse_mode: 'Markdown' });

    const sender = new WhatsAppSender(bot, ctx.chat.id);
    sender.sendRange(startId, endId, { skipExport: true }).catch(e => {
        console.error(`[Bot] ❌ Error during WhatsApp dispatch:`, e.message);
        ctx.reply(`❌ WhatsApp dispatch failed: ${e.message}`);
    });
});

bot.command('send', async (ctx) => {
    await handleSendRequest(ctx, ctx.message.text);
});

bot.hears(/(?:\/send|send)\s*\[?(\d+)(?::(\d+))?\]?/i, async (ctx) => {
    await handleSendRequest(ctx, ctx.message.text);
});

bot.command('login', async (ctx) => {
    ctx.reply("🖥️ Opening WhatsApp Web browser window for login... Please scan the QR code if prompted.");
    const sender = new WhatsAppSender(bot, ctx.chat.id);
    try {
        await sender.init(false);
        ctx.reply("✅ WhatsApp Web session initialized!");
    } catch (e) {
        ctx.reply(`❌ Login initialization error: ${e.message}`);
    }
});

bot.command('contacts', async (ctx) => {
    let startId = 1;
    let endId = 100;
    const rangeMatch = ctx.message.text.match(/(?:\/contacts|contacts)\s*\[?(\d+)\s*:\s*(\d+)\]?/i);
    if (rangeMatch) {
        startId = parseInt(rangeMatch[1], 10);
        endId = parseInt(rangeMatch[2], 10);
    }
    ctx.reply(`📇 Exporting contacts for Range [${startId}:${endId}]...`);
    const sender = new WhatsAppSender(bot, ctx.chat.id);
    const result = await sender.exportContacts(startId, endId);
    if (!result) {
        ctx.reply("⚠️ No contacts found in `reports/` for the specified range.");
    }
});

// Handler for build_<id>.txt or /build <id>
async function handleBuildRequest(ctx, text) {
    const match = text.match(/(?:build_|\/build\s+|\/build_)(\d+)(?:\.txt)?/i);
    if (!match) return;

    const clientId = parseInt(match[1], 10);
    const force = /--force|-f\b|force/i.test(text);

    console.log(`\n==================================================`);
    console.log(`[Bot] 🔨 Incoming Build Request -> Client ID: ${clientId} ${force ? '(FORCED REBUILD)' : ''}`);
    console.log(`==================================================`);

    ctx.reply(`Processing build request for Client ID ${clientId}...`);

    const builder = new WebsiteBuilder(bot, ctx.chat.id);
    builder.buildClientWebsite(clientId, force).catch(e => {
        console.error(`[Bot] ❌ Error building website for Client ${clientId}:`, e.message);
        ctx.reply(`❌ Build failed for Client ${clientId}: ${e.message}`);
    });
}

bot.command('build', async (ctx) => {
    await handleBuildRequest(ctx, ctx.message.text);
});

// Match raw text messages like "build_1.txt" or "build_1"
bot.hears(/(?:build_|\/build\s+|\/build_)(\d+)(?:\.txt)?/i, async (ctx) => {
    await handleBuildRequest(ctx, ctx.message.text);
});

bot.command('analyse', async (ctx) => {
    const text = ctx.message.text;
    console.log(`\n==================================================`);
    console.log(`[Bot] 🔍 Received Command: ${text}`);
    console.log(`==================================================`);
    ctx.reply('Parsing command and loading Google Sheet...');

    let startId = null;
    let endId = null;
    let excludedIds = [];

    // Parse --range [x:y]
    const rangeMatch = text.match(/--range\s+\[(\d+):(\d+)\]/);
    if (rangeMatch) {
        startId = parseInt(rangeMatch[1], 10);
        endId = parseInt(rangeMatch[2], 10);
        console.log(`[Bot] Range Filter: [${startId} to ${endId}]`);
    }

    // Parse - {a,b,c}
    const excludeMatch = text.match(/-\s+\{([0-9,]+)\}/);
    if (excludeMatch) {
        excludedIds = excludeMatch[1].split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
        console.log(`[Bot] Excluded IDs: ${excludedIds.join(', ')}`);
    }

    try {
        console.log(`[Bot] Fetching leads from Google Sheets...`);
        const { sheet } = await loadGoogleSheet();
        const leads = await getLeads(sheet, startId, endId, excludedIds);
        
        if (leads.length === 0) {
            console.log(`[Bot] ⚠️ No leads found matching criteria (or all matching leads in range have already been processed).`);
            return ctx.reply('No leads found matching criteria (or all matching leads already have notes).');
        }

        console.log(`[Bot] ✅ Found ${leads.length} new leads. Starting Orchestrator...`);
        ctx.reply(`Found ${leads.length} leads to process. Initializing Orchestrator...`);
        
        // Run in background so we don't block Telegram handling
        currentOrchestrator = new Orchestrator(bot, ctx.chat.id);
        currentOrchestrator.processLeads(leads).catch(e => {
            console.error("[Bot] ❌ Background processing error:", e);
            ctx.reply(`Fatal error during processing: ${e.message}`);
        });

    } catch (e) {
        console.error("[Bot] ❌ Error initializing /analyse:", e);
        ctx.reply(`Error initializing: ${e.message}`);
    }
});

bot.command('pause', (ctx) => {
    console.log(`[Bot] ⏸ Pause command received.`);
    if (currentOrchestrator && currentOrchestrator.state === 'RUNNING') {
        currentOrchestrator.state = 'PAUSED';
        ctx.reply('⏸ Analysis paused. (Will pause after the current lead finishes).');
    } else {
        ctx.reply('There is no running analysis to pause.');
    }
});

bot.command('resume', (ctx) => {
    console.log(`[Bot] ▶️ Resume command received.`);
    if (currentOrchestrator && currentOrchestrator.state === 'PAUSED') {
        currentOrchestrator.state = 'RUNNING';
        ctx.reply('▶️ Analysis resumed!');
    } else {
        ctx.reply('There is no paused analysis to resume.');
    }
});

bot.command('stop', (ctx) => {
    console.log(`[Bot] 🛑 Stop command received.`);
    if (currentOrchestrator && (currentOrchestrator.state === 'RUNNING' || currentOrchestrator.state === 'PAUSED')) {
        currentOrchestrator.state = 'STOPPED';
        ctx.reply('🛑 Analysis stopped. (Will stop entirely after the current lead safely finishes).');
    } else {
        ctx.reply('There is no running analysis to stop.');
    }
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log("CRM Enrichment Telegram Bot is running...");
