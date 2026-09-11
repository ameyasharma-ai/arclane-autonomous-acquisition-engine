import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { WhatsAppSender } from '../src/whatsapp_sender.js';

dotenv.config();

const token = process.env.TELEGRAM_SALES_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const bot = new Telegraf(token);

console.log("==================================================");
console.log("🤖 WhatsApp Outreach Telegram Bot is Initializing...");
console.log("==================================================");

bot.start((ctx) => {
    ctx.reply(
        "📱 *WhatsApp Dispatch Bot Ready!*\n\n" +
        "Commands:\n" +
        "• `/send [x:y]` - Send WhatsApp messages to clients in range (e.g. `/send [1:5]`)\n" +
        "• `/send <id>` - Send WhatsApp message to a single client (e.g. `/send 1`)\n" +
        "• `/login` - Open browser window to scan WhatsApp Web QR code",
        { parse_mode: 'Markdown' }
    );
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

async function handleSend(ctx, text) {
    let startId = null;
    let endId = null;

    // Match /send [x:y] or /send[x:y] or /send x:y
    const rangeMatch = text.match(/(?:\/send|send)\s*\[?(\d+)\s*:\s*(\d+)\]?/i);
    if (rangeMatch) {
        startId = parseInt(rangeMatch[1], 10);
        endId = parseInt(rangeMatch[2], 10);
    } else {
        // Match /send <id> or /send <id>
        const singleMatch = text.match(/(?:\/send|send)\s*\[?(\d+)\]?/i);
        if (singleMatch) {
            startId = parseInt(singleMatch[1], 10);
            endId = startId;
        }
    }

    if (startId === null || endId === null) {
        return ctx.reply("❌ Invalid format. Please use `/send [x:y]` (e.g. `/send [1:5]`) or `/send <id>` (e.g. `/send 511`).", { parse_mode: 'Markdown' });
    }

    console.log(`\n[Bot] Received WhatsApp Send command for Range [${startId}:${endId}]`);
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
        console.error("WhatsApp dispatch error:", e);
        ctx.reply(`❌ Error during dispatch: ${e.message}`);
    });
});

bot.command('send', async (ctx) => {
    await handleSend(ctx, ctx.message.text);
});

bot.hears(/(?:\/send|send)\s*\[?(\d+)(?::(\d+))?\]?/i, async (ctx) => {
    await handleSend(ctx, ctx.message.text);
});

bot.launch().then(() => {
    console.log("✅ WhatsApp Dispatch Bot is live and listening on Telegram!");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
