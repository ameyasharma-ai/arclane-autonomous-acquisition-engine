import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { loadGoogleSheet, getLeads } from './sheets.js';
import { Orchestrator } from './orchestrator.js';
import { WebsiteBuilder } from './builder.js';

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
let currentOrchestrator = null;

bot.start((ctx) => ctx.reply('Welcome to the CRM Enrichment & Website Builder Bot.\n\nCommands:\n• /analyse --range [x:y] - Run deep CRO/strategy analysis\n• build_<id>.txt or /build <id> - Build & deploy custom website via Antigravity Prompt\n• /pause, /resume, /stop - Manage running analysis'));

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
