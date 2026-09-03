import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { WhatsAppSender } from './src/whatsapp_sender.js';

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
        return ctx.reply("❌ Invalid format. Please use `/send [x:y]` (e.g. `/send [1:5]`) or `/send <id>` (e.g. `/send 1`).", { parse_mode: 'Markdown' });
    }

    console.log(`\n[Bot] Received WhatsApp Send command for Range [${startId}:${endId}]`);
    ctx.reply(`🚀 Preparing to send WhatsApp outreach for Range [${startId}:${endId}]...`);

    const sender = new WhatsAppSender(bot, ctx.chat.id);
    try {
        await sender.sendRange(startId, endId);
    } catch (e) {
        console.error("WhatsApp dispatch error:", e);
        ctx.reply(`❌ Error during dispatch: ${e.message}`);
    }
}

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
