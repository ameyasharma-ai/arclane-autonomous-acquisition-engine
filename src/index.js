import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { loadGoogleSheet, getLeads } from './sheets.js';
import { Orchestrator } from './orchestrator.js';

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.start((ctx) => ctx.reply('Welcome to the CRM Enrichment Bot. Use /analyse to start.'));

bot.command('analyse', async (ctx) => {
    const text = ctx.message.text;
    console.log(`[Bot] Received command: ${text}`);
    ctx.reply('Parsing command and loading Google Sheet...');

    let startId = null;
    let endId = null;
    let excludedIds = [];

    // Parse --range [x:y]
    const rangeMatch = text.match(/--range\s+\[(\d+):(\d+)\]/);
    if (rangeMatch) {
        startId = parseInt(rangeMatch[1], 10);
        endId = parseInt(rangeMatch[2], 10);
    }

    // Parse - {a,b,c}
    const excludeMatch = text.match(/-\s+\{([0-9,]+)\}/);
    if (excludeMatch) {
        excludedIds = excludeMatch[1].split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
    }

    try {
        const { sheet } = await loadGoogleSheet();
        const leads = await getLeads(sheet, startId, endId, excludedIds);
        
        if (leads.length === 0) {
            return ctx.reply('No leads found matching criteria (or all matching leads already have notes).');
        }

        console.log(`[Bot] Found ${leads.length} leads. Starting Orchestrator...`);
        ctx.reply(`Found ${leads.length} leads to process. Initializing Orchestrator...`);
        
        // Run in background so we don't block Telegram handling
        const orchestrator = new Orchestrator(bot, ctx.chat.id);
        orchestrator.processLeads(leads).catch(e => {
            console.error("Background processing error:", e);
            ctx.reply(`Fatal error during processing: ${e.message}`);
        });

    } catch (e) {
        console.error(e);
        ctx.reply(`Error initializing: ${e.message}`);
    }
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log("CRM Enrichment Telegram Bot is running...");
