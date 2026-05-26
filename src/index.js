import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { loadGoogleSheet, getLeads } from './sheets.js';
import { Orchestrator } from './orchestrator.js';

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
let currentOrchestrator = null;

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
        currentOrchestrator = new Orchestrator(bot, ctx.chat.id);
        currentOrchestrator.processLeads(leads).catch(e => {
            console.error("Background processing error:", e);
            ctx.reply(`Fatal error during processing: ${e.message}`);
        });

    } catch (e) {
        console.error(e);
        ctx.reply(`Error initializing: ${e.message}`);
    }
});

bot.command('pause', (ctx) => {
    if (currentOrchestrator && currentOrchestrator.state === 'RUNNING') {
        currentOrchestrator.state = 'PAUSED';
        ctx.reply('⏸ Analysis paused. (Will pause after the current lead finishes).');
    } else {
        ctx.reply('There is no running analysis to pause.');
    }
});

bot.command('resume', (ctx) => {
    if (currentOrchestrator && currentOrchestrator.state === 'PAUSED') {
        currentOrchestrator.state = 'RUNNING';
        ctx.reply('▶️ Analysis resumed!');
    } else {
        ctx.reply('There is no paused analysis to resume.');
    }
});

bot.command('stop', (ctx) => {
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
