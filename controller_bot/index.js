import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import path from 'path';
import { CONFIG } from './config.js';
import { Scheduler } from './scheduler.js';

const bot = new Telegraf(CONFIG.BOT_TOKEN);
let scheduler = null;
let masterChatId = null;

import { webUI } from '../src/web_ui.js';

// --- Web UI Integration Monkey Patch ---
const originalCommand = bot.command.bind(bot);
bot.command = (cmd, handler) => {
    webUI.registerCommand(cmd, handler);
    return originalCommand(cmd, handler);
};

const originalStart = bot.start.bind(bot);
bot.start = (handler) => {
    webUI.registerCommand('start', handler);
    return originalStart(handler);
};

const actionHandlers = {};
const originalAction = bot.action.bind(bot);
bot.action = (action, handler) => {
    actionHandlers[action] = handler;
    return originalAction(action, handler);
};
webUI.registerActionHandler(async (action, ctx) => {
    if (actionHandlers[action]) await actionHandlers[action](ctx);
});
// ---------------------------------------

webUI.syncToTelegramHook = async (msg, opts) => {
    // Only attempt Telegram sync if a real user has interacted with the Telegram bot (valid chat ID)
    if (masterChatId && masterChatId !== 'web_ui_user' && bot) {
        try {
            await bot.telegram.sendMessage(masterChatId, msg, opts);
        } catch (e) {
            // Silently log or ignore if chat is not found or user hasn't initiated chat on Telegram
            if (!e.message.includes('chat not found')) {
                console.warn("[WebUI->Telegram] Sync notice:", e.message);
            }
        }
    }
};



// Helper to build main interactive keyboard
function getMainKeyboard(isAuto = true) {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('📊 Live Status', 'cmd_status'),
            Markup.button.callback('📅 Today\'s Plan', 'cmd_today')
        ],
        [
            Markup.button.callback('🚀 360° Full Pipeline (1 Lead)', 'cmd_run_full_1'),
            Markup.button.callback('⚡ Stream Scrape & Build', 'cmd_manual_stream')
        ],
        [
            Markup.button.callback('🔄 Reset & Resume 24/7 Plan', 'cmd_reset_resume_plan'),
            Markup.button.callback('🛑 Abort Active Task', 'cmd_abort')
        ],
        [
            Markup.button.callback('📲 WhatsApp Dispatch', 'cmd_manual_send'),
            Markup.button.callback('🔍 Scrape Only', 'cmd_manual_scrape'),
            Markup.button.callback('⚙️ Build Only', 'cmd_manual_analyse')
        ],
        [
            isAuto 
                ? Markup.button.callback('⏸ Pause Automation', 'cmd_pause_auto')
                : Markup.button.callback('▶️ Resume Automation', 'cmd_resume_auto'),
            Markup.button.callback('📜 View Schedule JSON', 'cmd_view_plan')
        ],
        [
            Markup.button.callback('❓ All Help Commands', 'cmd_help'),
            Markup.button.callback('🗺️ Locality Coverage', 'cmd_coverage')
        ]
    ]);
}

// Global logger & chat ID detector middleware
bot.use(async (ctx, next) => {
    const text = ctx.message?.text || ctx.callbackQuery?.data || '';
    const senderId = String(ctx.from?.id || ctx.chat?.id || '');
    console.log(`[ControllerBot] 📩 Update: ${ctx.updateType} from chat ${ctx.chat?.id} (@${ctx.from?.username || ctx.from?.first_name || 'User'}): "${text}"`);
    
    // Security Access Whitelist Guard
    const allowedUsers = (process.env.ALLOWED_TELEGRAM_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (allowedUsers.length > 0 && !allowedUsers.includes(senderId) && ctx.chat?.id !== 'local-web-ui') {
        console.warn(`[ControllerBot] 🚫 Unauthorized access attempt from ID ${senderId} (@${ctx.from?.username || 'unknown'})`);
        return ctx.reply("⛔ *Access Denied:* You are not authorized to control the Arclane Autonomous Acquisition Engine.", { parse_mode: 'Markdown' });
    }

    if (ctx.chat?.id) {
        masterChatId = ctx.chat.id;
        if (!scheduler) {
            scheduler = new Scheduler(bot, masterChatId);
            scheduler.start();
        } else {
            scheduler.setChatId(masterChatId);
        }
    }
    
    // Bidirectional sync: anything sent to Telegram also goes to WebUI
    if (ctx.reply) {
        const originalReply = ctx.reply.bind(ctx);
        ctx.reply = async (text, extra) => {
            webUI.broadcast(text, extra);
            try {
                return await originalReply(text, extra);
            } catch(e) {
                console.error("[Telegram] Reply failed:", e.message);
            }
        };
    }

    return next();
});

// Global Error Handler
bot.catch((err, ctx) => {
    console.error('[ControllerBot] ❌ Error in update handler:', err);
    try {
        ctx.reply(`⚠️ *Error:* ${err.message}`, { parse_mode: 'Markdown' }).catch(() => {});
    } catch (e) {}
});

// Command: /start
async function handleStart(ctx) {
    masterChatId = ctx.chat.id;
    if (!scheduler) scheduler = new Scheduler(bot, masterChatId);
    scheduler.setChatId(masterChatId);

    const status = scheduler.getStatus();

    await ctx.reply(
        `🤖 *Arclane 24/7 Autonomous Controller Bot*\n\n` +
        `Welcome! I autonomously manage your entire client acquisition pipeline:\n` +
        `• *Real-Time Stream Scraper:* Streams leads from Google Maps concurrently into the builder\n` +
        `• *BI Intelligence & Builder:* 14-point audit & responsive website building per lead\n` +
        `• *Vercel Deployer:* Live business slug deployments\n` +
        `• *WhatsApp Dispatcher:* Timed, safe curiosity outreach waves\n\n` +
        `📍 *Status:* ${status.isAutoRunning ? '🟢 Running Automatically (24/7)' : '⏸ Paused'}\n` +
        `🕒 *Time:* ${status.currentTime} (IST)\n` +
        `📅 *Today (${status.todayName}):* ${status.todayFocus}\n\n` +
        `_Tap any button below or send a command to control the system:_`,
        {
            parse_mode: 'Markdown',
            ...getMainKeyboard(status.isAutoRunning)
        }
    );
}

bot.start(handleStart);
bot.action('cmd_start', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    await handleStart(ctx);
});

// Command: /status
bot.command('status', async (ctx) => {
    masterChatId = ctx.chat.id;
    if (!scheduler) scheduler = new Scheduler(bot, masterChatId);
    scheduler.setChatId(masterChatId);

    const s = scheduler.getStatus();
    const plan = scheduler.getTodayPlan();

    const msg = 
        `📊 *Controller Bot Real-Time Status*\n\n` +
        `• *Automation Mode:* ${s.isAutoRunning ? '🟢 ACTIVE (24/7 Cron)' : '⏸ PAUSED'}\n` +
        `• *Current Time:* \`${s.currentTime}\` (IST)\n` +
        `• *Today's Schedule:* *${s.todayName}*\n` +
        `• *Target Industry:* ${s.todayFocus}\n\n` +
        `*Live Task State:*\n` +
        `• 🔍 Scraper: ${s.isScraperRunning ? '🟡 Scraping Active' : '⚪ Idle'}\n` +
        `• ⚙️ Pipeline/Builder: ${s.isPipelineRunning ? '🟡 Building / Hosting Active' : '⚪ Idle'}\n\n` +
        `*Daily Schedule (Asia/Kolkata):*\n` +
        `• 06:00 AM - 07:30 AM: 🌅 Morning Stream Scrape, Build & Deploy (33 Leads into CRM)\n` +
        `• 07:30 AM: ⚙️ Safety Sweep & Data Verification\n` +
        `• 06:00 PM: 📞 Manual Calling & WhatsApp Free Gift Outreach Window`;

    await ctx.reply(msg, {
        parse_mode: 'Markdown',
        ...getMainKeyboard(s.isAutoRunning)
    });
});

// Command: /today
bot.command('today', async (ctx) => {
    masterChatId = ctx.chat.id;
    if (!scheduler) scheduler = new Scheduler(bot, masterChatId);
    scheduler.setChatId(masterChatId);

    const plan = scheduler.getTodayPlan();
    if (!plan) return ctx.reply("Could not load today's plan.");

    const msg = 
        `📅 *Today's Strategy Blueprint (${plan.dayName})*\n\n` +
        `• *Target Niche & City:* ${plan.focus}\n` +
        `• *Search Query:* \`${plan.tasks.scraper.query}\` (${plan.tasks.scraper.locality})\n` +
        `• *Target Volume:* ${plan.tasks.scraper.targetLeads || 33} leads\n\n` +
        `*Daily Workflow:*\n` +
        `• 06:00 AM - 07:30 AM: 🌅 Scrape, Audit, Build & Deploy to Vercel (Auto-appends to CRM)\n` +
        `• Daytime: 📞 Manual Calls & WhatsApp Pitching (Offer Free Website Gift)\n` +
        `• 06:00 PM: ⏰ Prime Evening Calling Window\n\n` +
        `💡 *Your "No-Risk Free Gift" Calling Script:*\n` +
        `_"${CONFIG.loadPlan()?.phoneScriptTemplates?.courtesyOpener || 'Hi [Owner], Ameya here from Arclane Studios. Maine aapke business ke liye ek custom website banakar WhatsApp par link share kiya hai. Ye completely free gift hai — agar pasand aaye toh aage baat karenge, nahi toh aap permanently free rakh sakte hain!'}"_`;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
});

// Command: /help, /commands, /cmd
async function handleHelp(ctx) {
    masterChatId = ctx.chat?.id || masterChatId;
    if (!scheduler && bot && masterChatId && masterChatId !== 'local-web-ui') {
        scheduler = new Scheduler(bot, masterChatId);
    }
    if (scheduler && masterChatId && masterChatId !== 'local-web-ui') {
        scheduler.setChatId(masterChatId);
    }

    const isAuto = scheduler ? scheduler.getStatus().isAutoRunning : true;

    const helpMsg = 
        `📖 *Arclane Controller Bot — Command Manual*\n\n` +
        `*🚀 Autonomous & Streaming Pipelines:*\n` +
        `• \`/run_full [query] [city] [count]\` — Complete 360° pipeline: Scrape ➔ 14-pt Audit ➔ Tailwind Site ➔ Subdomain Deploy ➔ WhatsApp curiosity hook.\n` +
        `  _Example:_ \`/run_full Gyms Patna 1\`\n` +
        `• \`/trigger_stream [query] [city] [count]\` — Concurrent real-time scrape & build. Streams leads from Google Maps straight into the builder.\n` +
        `  _Example:_ \`/trigger_stream "Gyms" "Patna" 10\`\n` +
        `• \`/stream_scrape_vision [query] [locality] [city] [count]\` — Vision AI pipeline. Scrapes authentic Maps photos, classifies with Gemini Vision, downloads HD assets, and synthesizes prototype.\n` +
        `• \`/auto_explore [query] [city] [count]\` — Autonomous multi-locality hopping chain across city commercial sectors.\n` +
        `  _Example:_ \`/auto_explore "Gyms" "Patna" 33\`\n\n` +
        `*🎯 Targeted Actions & Lead Fixes:*\n` +
        `• \`/build_url <maps_url>\` — Instantly scrape, audit, and build a site from any Google Maps link (or simply paste the URL into chat!).\n` +
        `• \`/fix <id>\` or \`/build <id>\` — Fix or rebuild specific lead by ID or range.\n` +
        `  _Examples:_ \`/fix 202\` or \`/fix 1:10\` (batch up to 30)\n` +
        `• \`/trigger_scrape [query] [city] [count]\` — Scrapes Google Maps leads directly into Sheet1 without building websites.\n` +
        `• \`/trigger_analyse [count]\` — AI audits and builds websites for pending scraped leads in Sheet1.\n` +
        `• \`/trigger_send [count]\` — Dispatches WhatsApp curiosity messages to leads with built sites.\n` +
        `• \`/approve\` or \`/launch\` — Confirms and launches queued WhatsApp outreach wave.\n\n` +
        `*📊 System Status & Strategy:*\n` +
        `• \`/status\` — Live bot state, active task, current IST time, and scheduled cron jobs.\n` +
        `• \`/today\` — Today's designated niche, target city, and planned schedule.\n` +
        `• \`/coverage [query] [city]\` — View micro-locality exploration saturation and lead distribution.\n` +
        `• \`/view_plan\` — View active 100-day schedule configuration JSON.\n\n` +
        `*🛑 Safeguards & Session Controls:*\n` +
        `• \`/target <number>\` or \`/set_target <number>\` — Dynamically sets/lowers lead target while running.\n` +
        `• \`/abort\` or \`/stop\` — Emergency Kill Switch: immediately halts all active scraping and building child processes.\n` +
        `• \`/pause_auto\` — Pauses 24/7 background cron automation.\n` +
        `• \`/start_auto\` — Resumes 24/7 background cron automation.\n` +
        `• \`/reset_plan\` — Aborts current manual tasks and resets to automated daily timetable.\n` +
        `• \`/login\` — Opens headed browser to scan WhatsApp Web QR code session.\n` +
        `• \`/help\` — Display this command manual.`;

    await ctx.reply(helpMsg, {
        parse_mode: 'Markdown',
        ...getMainKeyboard(isAuto)
    });
}

bot.command('help', handleHelp);
bot.command('commands', handleHelp);
bot.command('cmd', handleHelp);

bot.action('cmd_help', async (ctx) => {
    try { await ctx.answerCbQuery('📖 Loading Help Manual...'); } catch (e) {}
    await handleHelp(ctx);
});

// Command: /start_auto
bot.command('start_auto', async (ctx) => {
    masterChatId = ctx.chat.id;
    if (!scheduler) scheduler = new Scheduler(bot, masterChatId);
    scheduler.setChatId(masterChatId);
    scheduler.resume();
    await ctx.reply(`🟢 *24/7 Autonomous Scheduler Active!*\nRunning daily timetable in \`Asia/Kolkata\` timezone.`, {
        parse_mode: 'Markdown',
        ...getMainKeyboard(true)
    });
});

// Command: /pause_auto
bot.command('pause_auto', async (ctx) => {
    masterChatId = ctx.chat.id;
    if (!scheduler) scheduler = new Scheduler(bot, masterChatId);
    scheduler.setChatId(masterChatId);
    scheduler.pause();
    await ctx.reply(`⏸ *Autonomous Scheduler Paused.*\nNo automated cron jobs will trigger until resumed. (Manual triggers still work)`, {
        parse_mode: 'Markdown',
        ...getMainKeyboard(false)
    });
});

import { WhatsAppSender } from '../src/whatsapp_sender.js';

// Command: /login
bot.command('login', async (ctx) => {
    masterChatId = ctx.chat.id;
    if (!scheduler) scheduler = new Scheduler(bot, masterChatId);
    scheduler.setChatId(masterChatId);
    
    await ctx.reply(`🔄 *Starting WhatsApp Authentication Sequence...*\nPlease wait while Playwright launches and generates the QR code...`, { parse_mode: 'Markdown' });
    
    try {
        const sender = new WhatsAppSender(bot, masterChatId);
        await sender.init(false); 
        await ctx.reply(`✅ *WhatsApp Login sequence completed.*`, { parse_mode: 'Markdown' });
        await sender.close();
    } catch (e) {
        await ctx.reply(`❌ *Failed to login to WhatsApp:* ${e.message}`, { parse_mode: 'Markdown' });
    }
});

// Helper for quoted argument parsing (e.g. /run_full "Gyms" "Jaipur" 1)
function parseArgs(text) {
    const match = text.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g);
    if (!match) return [];
    return match.map(arg => arg.replace(/^['"]|['"]$/g, '')).slice(1);
}

// Command: /run_full [query] [city] [count] (Scrape + Build + Deploy + WhatsApp Outreach)
async function handleRunFull(ctx) {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.setChatId(ctx.chat.id);

    const args = parseArgs(ctx.message.text);
    const plan = scheduler.getTodayPlan();
    const query = args[0] || plan?.tasks.scraper.query || "Gyms";
    const city = args[1] || plan?.tasks.scraper.city || "Patna";
    const count = parseInt(args[2], 10) || 1;

    await ctx.reply(
        `🚀 *Launching 1-Lead Test Pipeline for ${count} lead(s)...*\n\n` +
        `📍 *Niche:* \`${query}\`\n` +
        `🏙️ *City:* \`${city}\`\n` +
        `⚡ *Stages:* Google Maps Scrape ➔ 14-Point Audit ➔ Build Website ➔ Host on Vercel ➔ Auto-Save to CRM\n` +
        `🛑 Type \`/abort\` to cancel, or \`/reset_plan\` to restore 24/7 schedule.`,
        { parse_mode: 'Markdown' }
    );

    scheduler.pipelineRunner.runFullEndToEndPipeline({
        query,
        locality: `in`,
        city,
        targetLeads: count,
        scraperRunner: scheduler.scraperRunner
    }).catch(e => {
        if (!scheduler.pipelineRunner.isAborted) {
            ctx.reply(`❌ 360° Pipeline error: ${e.message}`);
        }
    });
}

bot.command('run_full', handleRunFull);
bot.command('trigger_full', handleRunFull);

// Command: /reset_plan or /resume_plan (Cleanly abort manual tasks and restore pristine 24/7 plan state)
async function handleResetResumePlan(ctx) {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.setChatId(ctx.chat.id);

    const wasScraperRunning = scheduler.scraperRunner.isRunning;
    const wasPipelineRunning = scheduler.pipelineRunner.isProcessing;

    scheduler.abortAndResumePlan();

    const plan = scheduler.getTodayPlan();

    await ctx.reply(
        `🔄 *[Controller] SYSTEM RESET TO SCHEDULED 24/7 PLAN!*\n\n` +
        `• Active Manual Tasks: ${wasScraperRunning || wasPipelineRunning ? 'Terminated & Flushed 🛑' : 'Already Clear ⚪'}\n` +
        `• Pipeline State: Cleanly Reset to Idle 🔄\n` +
        `• 24/7 Automation: 🟢 *ACTIVE & RUNNING*\n` +
        `• Today's Target (${plan?.dayName}): *${plan?.focus}*\n\n` +
        `📅 *Daily Workflow:*\n` +
        `• 06:00 AM - 07:30 AM: 🌅 Morning Stream Scrape, Build & Deploy (${plan?.tasks.scraper.targetLeads || 33} leads auto-saved to CRM)\n` +
        `• 07:30 AM: ⚙️ Safety Sweep Analysis\n` +
        `• 06:00 PM: 📞 Manual Calling Window (Free Website Gift Offer)`,
        { parse_mode: 'Markdown', ...getMainKeyboard(true) }
    );
}

bot.command('reset_plan', handleResetResumePlan);
bot.command('resume_plan', handleResetResumePlan);
bot.command('abort_and_resume', handleResetResumePlan);

// Flag for user-requested cancellation of manual batch fix jobs
let isFixLeadAborted = false;

// Command: /abort and /stop
async function handleAbort(ctx) {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.setChatId(ctx.chat.id);
    isFixLeadAborted = true;

    const wasScraperRunning = scheduler.scraperRunner.isRunning;
    const wasPipelineRunning = scheduler.pipelineRunner.isProcessing;

    scheduler.abort();

    await ctx.reply(
        `🛑 *[Controller] ABORT SIGNAL SENT!*\n\n` +
        `• Scraper Process: ${wasScraperRunning ? 'Terminated 🛑' : 'Was Idle ⚪'}\n` +
        `• Pipeline / Builder Queue: ${wasPipelineRunning ? 'Cleared & Cancelled 🛑' : 'Was Idle ⚪'}\n` +
        `• WhatsApp Dispatcher: Reset 🛑\n\n` +
        `💡 To immediately resume the 24/7 automated timetable, send \`/reset_plan\` or tap the button below.`,
        { parse_mode: 'Markdown', ...getMainKeyboard(scheduler.isAutoRunning) }
    );
}

bot.command('abort', handleAbort);
bot.command('stop', handleAbort);

// Command: /set_target [newTarget] or /target [newTarget]
async function handleSetTarget(ctx) {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.setChatId(ctx.chat.id);

    const args = parseArgs(ctx.message.text);
    const newTarget = parseInt(args[0], 10);

    if (isNaN(newTarget) || newTarget <= 0) {
        return ctx.reply(
            `⚠️ *Invalid Target!*\n\n` +
            `Usage: \`/set_target <number>\` or \`/target <number>\`\n` +
            `Example: \`/target 20\` or \`/target 35\`\n\n` +
            `This command dynamically adjusts the lead ceiling for an active scraping or auto-exploration session on the fly.`,
            { parse_mode: 'Markdown' }
        );
    }

    const isRunning = scheduler.pipelineRunner.isProcessing || scheduler.scraperRunner.isRunning;
    const res = scheduler.pipelineRunner.setTarget(newTarget);

    if (!isRunning) {
        return ctx.reply(
            `🎯 *Target Set to ${newTarget} Leads.*\n\n` +
            `ℹ️ No pipeline is actively running right now. Next time you trigger \`/auto_explore\` or \`/stream_scrape\`, you can specify this target or let the system use default.`,
            { parse_mode: 'Markdown' }
        );
    }

    const currentCount = res.currentAccumulated;
    if (currentCount >= newTarget) {
        await ctx.reply(
            `🎯 *Dynamic Target Lowered to ${newTarget}!* 🛑\n\n` +
            `• Current Progress: \`${currentCount} / ${newTarget}\` leads.\n` +
            `• Action: Target already met! Stopping scraper gracefully.\n` +
            `• 📦 Any remaining queued websites will finish synthesis and deploy to production automatically without data loss.`,
            { parse_mode: 'Markdown' }
        );
    } else {
        await ctx.reply(
            `🎯 *Dynamic Target Updated to ${newTarget}!* ⚡\n\n` +
            `• Previous Ceiling: \`${res.oldTarget}\`\n` +
            `• New Ceiling: \`${newTarget}\`\n` +
            `• Current Progress: \`${currentCount} / ${newTarget}\` leads.\n` +
            `• Remaining Needed: \`${newTarget - currentCount}\` leads.\n\n` +
            `The engine will seamlessly conclude as soon as lead #${newTarget} is reached!`,
            { parse_mode: 'Markdown' }
        );
    }
}

bot.command('set_target', handleSetTarget);
bot.command('target', handleSetTarget);

// Command: /trigger_stream & /stream_scrape [query] [locality/city] [city] [count]
async function handleTriggerStream(ctx) {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.setChatId(ctx.chat.id);

    const args = parseArgs(ctx.message.text);
    const plan = scheduler.getTodayPlan();
    const query = args[0] || plan?.tasks.scraper.query || "Gyms";

    let locality = `in Patna`;
    let city = "Patna";
    let count = 35;

    if (args.length >= 3 && isNaN(parseInt(args[1], 10)) && isNaN(parseInt(args[2], 10))) {
        // e.g. /stream_scrape "Fitness Studios" "Kankarbagh, Patna" "Patna" 33
        locality = args[1].startsWith('in ') ? args[1] : `in ${args[1]}`;
        city = args[2] || "Patna";
        count = parseInt(args[3], 10) || plan?.tasks.scraper.targetLeads || 35;
    } else {
        // Standard syntax: [query] [city] [count]
        city = args[1] || plan?.tasks.scraper.city || "Patna";
        count = parseInt(args[2], 10) || plan?.tasks.scraper.targetLeads || 35;
        locality = `in ${city}`;
    }

    await ctx.reply(
        `⚡ Launching concurrent stream scrape & build for *${query}* in *${locality}* (${count} leads)...\n🛑 Send \`/abort\` to cancel.`,
        { parse_mode: 'Markdown' }
    );

    scheduler.pipelineRunner.runStreamingScrapeAndBuild({
        query,
        locality,
        city,
        targetLeads: count,
        scraperRunner: scheduler.scraperRunner
    }).catch(e => {
        if (!scheduler.pipelineRunner.isAborted) {
            ctx.reply(`❌ Stream error: ${e.message}`);
        }
    });
}
bot.command('trigger_stream', handleTriggerStream);
bot.command('stream_scrape', handleTriggerStream);

// Command: /stream_scrape_vision & /run_vision [query] [locality] [city] [count]
async function handleVisionStream(ctx) {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat?.id || 'local-web-ui');
    if (ctx.chat?.id) scheduler.setChatId(ctx.chat.id);

    const args = parseArgs(ctx.message?.text || '');
    const query = args[0] || "Restaurants";
    let locality = args[1] || "in Patna";
    if (!locality.startsWith('in ')) locality = `in ${locality}`;
    let city = args[2] || "Patna";
    let count = parseInt(args[3], 10) || 1;

    await ctx.reply(
        `📸 *[Vision AI Pipeline]* Launching Google Maps photo scraping & website generation for *${query}* in *${locality}* (${count} lead${count > 1 ? 's' : ''})...\n` +
        `• *Photos:* Real Google Maps uploads\n` +
        `• *Classifier:* Gemini Vision AI\n` +
        `• *Output:* Custom live demo on arclanestudios.space\n\n` +
        `🛑 Send \`/abort\` to halt at any time.`,
        { parse_mode: 'Markdown' }
    );

    scheduler.pipelineRunner.runStreamingScrapeAndBuild({
        query,
        locality,
        city,
        targetLeads: count,
        scraperRunner: scheduler.scraperRunner
    }).catch(e => {
        if (!scheduler.pipelineRunner.isAborted) {
            ctx.reply(`❌ Vision stream error: ${e.message}`);
        }
    });
}
bot.command('stream_scrape_vision', handleVisionStream);
bot.command('run_vision', handleVisionStream);
bot.command('vision', handleVisionStream);
bot.action('cmd_vision_stream', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    await handleVisionStream(ctx);
});

// Command: /trigger_scrape [query] [city] [count]
bot.command('trigger_scrape', async (ctx) => {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.setChatId(ctx.chat.id);

    const args = parseArgs(ctx.message.text);
    const query = args[0] || "Gyms";
    const city = args[1] || "Pune";
    const count = parseInt(args[2], 10) || 35;

    await ctx.reply(
        `🚀 Manually triggering scrape for *${query}* in *${city}* (${count} leads)...\n🛑 Send \`/abort\` to cancel.`,
        { parse_mode: 'Markdown' }
    );

    scheduler.scraperRunner.runScrape({
        query,
        locality: `in`,
        city,
        targetLeads: count
    }).catch(e => ctx.reply(`❌ Scrape error: ${e.message}`));
});

// Command: /trigger_analyse [maxLeads]
bot.command('trigger_analyse', async (ctx) => {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.setChatId(ctx.chat.id);

    const args = parseArgs(ctx.message.text);
    const count = parseInt(args[0], 10) || 35;

    await ctx.reply(`🚀 Manually triggering batch analysis & website build (max ${count} leads)...`, { parse_mode: 'Markdown' });
    scheduler.pipelineRunner.runAnalyseAndBuild(count).catch(e => ctx.reply(`❌ Analysis error: ${e.message}`));
});

// Command: /trigger_send [count]
bot.command('trigger_send', async (ctx) => {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.setChatId(ctx.chat.id);

    const args = parseArgs(ctx.message.text);
    const count = parseInt(args[0], 10) || 18;

    await ctx.reply(`🚀 Manually triggering WhatsApp dispatch wave (batch size: ${count})...`, { parse_mode: 'Markdown' });
    scheduler.pipelineRunner.runDispatchWave(count).catch(e => ctx.reply(`❌ Dispatch error: ${e.message}`));
});

// Callback Query Handlers for Inline Buttons
bot.action('cmd_status', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    const s = scheduler.getStatus();
    const plan = scheduler.getTodayPlan();
    await ctx.editMessageText(
        `📊 *Controller Bot Real-Time Status*\n\n` +
        `• *Automation Mode:* ${s.isAutoRunning ? '🟢 ACTIVE (24/7 Cron)' : '⏸ PAUSED'}\n` +
        `• *Current Time:* \`${s.currentTime}\` (IST)\n` +
        `• *Today's Schedule:* *${s.todayName}*\n` +
        `• *Target Industry:* ${s.todayFocus}\n\n` +
        `*Live Task State:*\n` +
        `• 🔍 Scraper: ${s.isScraperRunning ? '🟡 Scraping Active' : '⚪ Idle'}\n` +
        `• *Daily Schedule:*\n` +
        `• 06:00 AM - 07:30 AM: 🌅 Morning Stream Scrape, Build & Deploy (33 Leads into CRM)\n` +
        `• 07:30 AM: ⚙️ Safety Sweep & Data Verification\n` +
        `• 06:00 PM: 📞 Manual Calling & WhatsApp Free Gift Outreach Window`,
        {
            parse_mode: 'Markdown',
            ...getMainKeyboard(s.isAutoRunning)
        }
    );
});

bot.action('cmd_today', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    const plan = scheduler.getTodayPlan();
    await ctx.reply(
        `📅 *Today's Schedule: ${plan?.dayName}*\n\n` +
        `• *Target Focus:* ${plan?.focus}\n` +
        `• *Scrape Query:* \`${plan?.tasks.scraper.query}\` (${plan?.tasks.scraper.locality})\n` +
        `• *Target Leads:* ${plan?.tasks.scraper.targetLeads} leads\n` +
        `• *WhatsApp Wave 1:* 12:00 PM (${plan?.tasks.dispatchWave1.batchSize} msgs)\n` +
        `• *WhatsApp Wave 2:* 04:30 PM (${plan?.tasks.dispatchWave2.batchSize} msgs)\n` +
        `• *Follow-Up Window:* 06:00 PM (Target: ${plan?.tasks.followUpReview.targetCloses || 1} deal)`,
        { parse_mode: 'Markdown' }
    );
});

bot.action('cmd_run_full_1', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    const plan = scheduler.getTodayPlan();
    const query = plan?.tasks.scraper.query || "Gyms";
    const city = plan?.tasks.scraper.city || "Patna";

    await ctx.reply(
        `🚀 *Launching 1-Lead Test Pipeline (Patna)...*\n\n` +
        `📍 *Niche:* \`${query}\`\n` +
        `🏙️ *City:* \`${city}\`\n` +
        `⚡ *Stages:* Scrape ➔ 14-Point Audit ➔ Build Website ➔ Host on Vercel ➔ Auto-Save to CRM\n` +
        `🛑 Type \`/abort\` to cancel, or \`/reset_plan\` to restore 24/7 schedule.`,
        { parse_mode: 'Markdown' }
    );

    scheduler.pipelineRunner.runFullEndToEndPipeline({
        query,
        locality: `in`,
        city,
        targetLeads: 1,
        scraperRunner: scheduler.scraperRunner
    }).catch(e => {
        if (!scheduler.pipelineRunner.isAborted) {
            ctx.reply(`❌ 360° Pipeline error: ${e.message}`);
        }
    });
});

bot.action('cmd_reset_resume_plan', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    await handleResetResumePlan(ctx);
});

bot.action('cmd_abort', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    await handleAbort(ctx);
});

bot.action('cmd_pause_auto', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.pause();
    await ctx.editMessageReplyMarkup(getMainKeyboard(false).reply_markup);
    await ctx.reply("⏸ *Automation Paused.* Scheduled cron jobs are suspended.");
});

bot.action('cmd_resume_auto', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.resume();
    await ctx.editMessageReplyMarkup(getMainKeyboard(true).reply_markup);
    await ctx.reply("🟢 *Automation Resumed.* Running 24/7 on schedule.");
});

bot.action('cmd_manual_stream', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    const plan = scheduler.getTodayPlan();
    const query = plan?.tasks.scraper.query || "Gyms";
    const city = plan?.tasks.scraper.city || "Pune";
    const count = plan?.tasks.scraper.targetLeads || 35;

    await ctx.reply(
        `⚡ Launching concurrent stream scrape & build for *${query}* in *${city}* (${count} leads)...\n🛑 Send \`/abort\` to cancel.`,
        { parse_mode: 'Markdown' }
    );

    scheduler.pipelineRunner.runStreamingScrapeAndBuild({
        query,
        locality: `in`,
        city,
        targetLeads: count,
        scraperRunner: scheduler.scraperRunner
    }).catch(e => {
        if (!scheduler.pipelineRunner.isAborted) {
            ctx.reply(`❌ Stream error: ${e.message}`);
        }
    });
});

bot.action('cmd_manual_scrape', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    const plan = scheduler.getTodayPlan();
    const query = plan?.tasks.scraper.query || "Gyms";
    const city = plan?.tasks.scraper.city || "Pune";
    const count = plan?.tasks.scraper.targetLeads || 35;

    await ctx.reply(
        `🚀 Starting manual scrape for *${query}* in *${city}* (${count} leads)...\n🛑 Send \`/abort\` to cancel.`,
        { parse_mode: 'Markdown' }
    );

    scheduler.scraperRunner.runScrape({
        query,
        locality: `in`,
        city,
        targetLeads: count
    }).catch(e => ctx.reply(`❌ Scrape error: ${e.message}`));
});

bot.action('cmd_manual_analyse', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    await ctx.reply(`🚀 Starting manual batch analysis & website builds for new leads...`, { parse_mode: 'Markdown' });
    scheduler.pipelineRunner.runAnalyseAndBuild(35).catch(e => ctx.reply(`❌ Analysis error: ${e.message}`));
});

bot.action('cmd_manual_send', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    await ctx.reply(`🚀 Triggering WhatsApp dispatch wave...`, { parse_mode: 'Markdown' });
    scheduler.pipelineRunner.runDispatchWave(18).catch(e => ctx.reply(`❌ Dispatch error: ${e.message}`));
});

const handleApproveLaunch = async (ctx) => {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.setChatId(ctx.chat.id);

    try {
        await ctx.reply('🟢 *Green signal confirmed!* Initializing WhatsApp Web dispatch wave...', { parse_mode: 'Markdown' });
        scheduler.pipelineRunner.executeApprovedDispatch().catch(e => ctx.reply(`❌ Dispatch error: ${e.message}`));
    } catch (err) {
        await ctx.reply(`⚠️ ${err.message}`);
    }
};

bot.command('approve', handleApproveLaunch);
bot.command('launch', handleApproveLaunch);

bot.action('cmd_approve_dispatch', async (ctx) => {
    try { await ctx.answerCbQuery('⚡ Launching WhatsApp Dispatch...'); } catch (e) {}
    await handleApproveLaunch(ctx);
});

bot.action('cmd_dismiss_dispatch', async (ctx) => {
    try { await ctx.answerCbQuery('Wave postponed.'); } catch (e) {}
    if (scheduler && scheduler.pipelineRunner) {
        scheduler.pipelineRunner.pendingDispatch = null;
    }
    await ctx.reply('⏸️ *WhatsApp dispatch wave postponed.* You can manually trigger it anytime with `/trigger_send`.', { parse_mode: 'Markdown' });
});

const handleViewPlan = async (ctx) => {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.setChatId(ctx.chat.id);

    const activePlan = CONFIG.loadPlan();
    const todayPlan = scheduler.getTodayPlan();

    if (!activePlan) {
        return ctx.reply('⚠️ *Could not load schedule blueprint JSON.* Please check `plan/week_1_plan.json`.', { parse_mode: 'Markdown' });
    }

    const agency = activePlan.agency || {};
    const autoSettings = activePlan.automationSettings || {};
    const days = activePlan.dailySchedule || [];

    let scheduleSummary = days.map(d => {
        const isCurrent = todayPlan && d.dayNumber === todayPlan.dayNumber ? ' 👈 (Today)' : '';
        return `• *${d.dayName}* (Day ${d.dayNumber})${isCurrent}: \`${d.focus}\` [Target: ${d.tasks?.scraper?.targetLeads || 35} leads]`;
    }).join('\n');

    const message = 
        `📜 *Acquisition Blueprint Inspector*\n\n` +
        `🏢 *Agency:* ${agency.name || 'Arclane Studios'} (${agency.founder || 'Founder'})\n` +
        `🎯 *Target Market:* ${agency.targetMarket || 'Indian SMBs'}\n` +
        `💰 *Goal:* ${agency.targetGoal?.targetClients || '15-20 Clients'} @ ₹${agency.targetGoal?.averageDealSizeINR || 7999} (Est. ${agency.targetGoal?.projectedRevenueINR || '₹1.2L - 1.6L'})\n\n` +
        `⚙️ *Automation Guardrails:*\n` +
        `• Timezone: \`${autoSettings.timezone || 'Asia/Kolkata'}\`\n` +
        `• WhatsApp Safe Limits: Max ${autoSettings.whatsappSafeLimits?.maxPerBatch || 20}/batch, ${autoSettings.whatsappSafeLimits?.maxPerDay || 40}/day (${autoSettings.whatsappSafeLimits?.minDelaySeconds || 30}-${autoSettings.whatsappSafeLimits?.maxDelaySeconds || 75}s delay)\n` +
        `• Lead Qualification: Min ${autoSettings.leadQualificationFilter?.minRating || 4.5}★ (${autoSettings.leadQualificationFilter?.minReviews || 30}+ reviews)\n\n` +
        `📅 *Weekly Plan Roadmap:*\n` +
        `${scheduleSummary}\n\n` +
        `📄 *Raw JSON Configuration File:* \`plan/week_1_plan.json\``;

    await ctx.reply(message, { parse_mode: 'Markdown' });
};

bot.command('view_plan', handleViewPlan);
bot.command('plan', handleViewPlan);

bot.action('cmd_view_plan', async (ctx) => {
    try { await ctx.answerCbQuery('📜 Loading Blueprint Details...'); } catch (e) {}
    await handleViewPlan(ctx);
});

// Command: /coverage [niche] [city]
bot.command('coverage', async (ctx) => {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    const args = parseArgs(ctx.message.text);
    const niche = args[0] || "Gyms";
    const city = args[1] || "Patna";
    const { localityEngine } = await import('../src/engine/locality_engine.js');
    const report = localityEngine.getCoverageReport(niche, 'Bihar', city);

    let text = `🗺️ *Locality Coverage Matrix for ${niche} (${city}, ${report.state})*\n\n` +
               `• *Coverage Rate:* ${report.coveredLocalities}/${report.totalLocalities} Localities (${report.coveragePercentage}%)\n` +
               `• *Total Leads Gathered:* ${report.totalLeads} leads\n\n` +
               `*Breakdown by Area:*\n`;
    report.breakdown.forEach(b => {
        const icon = b.status === 'COMPLETED' ? '✅' : '⚪';
        text += `${icon} *${b.locality}:* ${b.leads} leads ${b.lastScraped ? `(\`${new Date(b.lastScraped).toLocaleDateString()}\`)` : ''}\n`;
    });

    await ctx.reply(text, { parse_mode: 'Markdown' });
});

bot.action('cmd_coverage', async (ctx) => {
    try { await ctx.answerCbQuery('🗺️ Loading Coverage Matrix...'); } catch (e) {}
    const { localityEngine } = await import('../src/engine/locality_engine.js');
    const report = localityEngine.getCoverageReport("Gyms", 'Bihar', "Patna");

    let text = `🗺️ *Locality Coverage Matrix for Gyms (Patna, ${report.state})*\n\n` +
               `• *Coverage Rate:* ${report.coveredLocalities}/${report.totalLocalities} Localities (${report.coveragePercentage}%)\n` +
               `• *Total Leads Gathered:* ${report.totalLeads} leads\n\n` +
               `*Breakdown by Area:*\n`;
    report.breakdown.forEach(b => {
        const icon = b.status === 'COMPLETED' ? '✅' : '⚪';
        text += `${icon} *${b.locality}:* ${b.leads} leads ${b.lastScraped ? `(\`${new Date(b.lastScraped).toLocaleDateString()}\`)` : ''}\n`;
    });

    await ctx.reply(text, { parse_mode: 'Markdown' });
});

// Command: /auto_explore [niche] [city] [targetTotal]
bot.command('auto_explore', async (ctx) => {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.setChatId(ctx.chat.id);
    const args = parseArgs(ctx.message.text);
    const niche = args[0] || "Gyms";
    const city = args[1] || "Patna";
    const target = parseInt(args[2], 10) || 50;

    await ctx.reply(
        `🚀 *Initiating Autonomous Locality Chained Explorer!*\n` +
        `• Niche: \`${niche}\`\n` +
        `• City: \`${city}\`\n` +
        `• Target: \`${target}\` Leads\n\n` +
        `The system will hop micro-localities whenever Google Maps exhausts results until ${target} leads are secured. Send \`/abort\` to halt.`,
        { parse_mode: 'Markdown' }
    );

    scheduler.pipelineRunner.runLocalityChain({
        query: niche,
        city,
        state: 'Bihar',
        targetTotal: target,
        scraperRunner: scheduler.scraperRunner
    }).catch(e => {
        if (!scheduler.pipelineRunner.isAborted) ctx.reply(`❌ Auto explore error: ${e.message}`);
    });
});

// Command: /build_url [Maps Link]
async function handleBuildUrl(ctx, mapsUrl) {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.setChatId(ctx.chat.id);

    await ctx.reply(`🎯 *Identified Google Maps target URL.*\nLaunching instant bespoke scraper & website synthesizer...`, { parse_mode: 'Markdown' });
    scheduler.pipelineRunner.buildFromMapsUrl(mapsUrl).catch(e => {
        ctx.reply(`❌ Build from URL failed: ${e.message}`);
    });
}

bot.command('build_url', async (ctx) => {
    const args = parseArgs(ctx.message.text);
    const url = args[0];
    if (!url || !url.startsWith('http')) {
        return ctx.reply("Please provide a valid Google Maps URL. Example: `/build_url https://maps.app.goo.gl/...`", { parse_mode: 'Markdown' });
    }
    await handleBuildUrl(ctx, url);
});


// ==========================================
// Core Lead Fix & Rebuild Worker
// ==========================================
async function fixLeadCore(clientId, ctx, { isBatch = false, allLeadsCache = null } = {}) {
    const { loadGoogleSheet } = await import('../src/sheets.js');
    const { mapsPhotoCrawler } = await import('../src/engine/maps_photo_crawler.js');
    const { mapsPhotoPipeline } = await import('../src/engine/maps_photo_pipeline.js');
    const { agencyPublisher } = await import('../src/agency_publisher.js');
    const { WebsiteBuilder } = await import('../src/builder.js');
    const fsMod = await import('fs');
    const pathMod = await import('path');

    let lead = null;
    if (allLeadsCache && Array.isArray(allLeadsCache)) {
        lead = allLeadsCache.find(l => Number(l['Client ID']) === clientId);
    }

    if (!lead) {
        const latestJsonPath = pathMod.join(process.cwd(), 'data_exports', 'crm_leads_latest.json');
        if (fsMod.existsSync(latestJsonPath)) {
            try {
                const allLeads = JSON.parse(fsMod.readFileSync(latestJsonPath, 'utf8'));
                lead = allLeads.find(l => Number(l['Client ID']) === clientId);
            } catch (e) {}
        }
    }

    if (!lead) {
        try {
            const { sheet } = await loadGoogleSheet();
            const rows = await sheet.getRows();
            const r = rows.find(row => Number(row.get('Client ID')) === clientId);
            if (r) {
                lead = {
                    'Client ID': clientId,
                    'Business Name': r.get('Business Name'),
                    'Industry/Niche': r.get('Industry/Niche'),
                    'Address': r.get('Address'),
                    'Google Maps URL': r.get('Google Maps URL') || r.get('Maps URL') || r.get('URL')
                };
            }
        } catch (e) {}
    }

    if (!lead) {
        throw new Error(`Lead #${clientId} not found in CRM leads or Google Sheets.`);
    }

    const businessName = lead?.['Business Name'] || `Lead ${clientId}`;
    const industry = lead?.['Industry/Niche'] || 'Commercial';
    const address = lead?.['Address'] || '';
    const mapsUrl = lead?.['Google Maps URL'] || '';

    if (!isBatch) {
        await ctx.reply(`📍 *Business:* \`${businessName}\` (${industry})\n👀 *[Visual Bot Active]* Crawling Google Maps photos...`, { parse_mode: 'Markdown' });
    }

    // Crawl candidate photos in visual mode
    let candidateUrls = [];
    try {
        candidateUrls = await mapsPhotoCrawler.fetchPhotosForBusiness(businessName, mapsUrl, address);
        await mapsPhotoCrawler.close();
    } catch (crawlErr) {
        console.warn(`[FixLead #${clientId}] Crawl notice:`, crawlErr.message);
    }

    // Classify with Gemini Vision
    if (!isBatch) {
        await ctx.reply(`📸 Analyzing ${candidateUrls.length} candidate photos with Gemini Vision...`);
    }
    const classified = await mapsPhotoPipeline.classifyPhotos(candidateUrls, businessName, industry);

    // Stage clean assets
    const slug = await agencyPublisher.getSlug(businessName);
    const agencySiteDir = pathMod.join(agencyPublisher.agencyPublicSitesDir, slug);
    const clientSiteDir = pathMod.join(process.cwd(), 'generated_sites', String(clientId));
    const reportsClientDir = pathMod.join(process.cwd(), 'reports', String(clientId));

    // Purge old discarded assets
    [agencySiteDir, clientSiteDir, reportsClientDir].forEach(dir => {
        const assetsDir = pathMod.join(dir, 'assets');
        if (fsMod.existsSync(assetsDir)) {
            ['hero.jpg', 'gallery-1.jpg'].forEach(badFile => {
                const p = pathMod.join(assetsDir, badFile);
                if (fsMod.existsSync(p) && classified.useStockForHero) {
                    try { fsMod.unlinkSync(p); } catch (e) {}
                }
            });
        }
    });

    await mapsPhotoPipeline.downloadAndStageAssets(classified, agencySiteDir);
    await mapsPhotoPipeline.downloadAndStageAssets(classified, clientSiteDir);
    const stagedManifest = await mapsPhotoPipeline.downloadAndStageAssets(classified, reportsClientDir);

    fsMod.writeFileSync(pathMod.join(reportsClientDir, 'photos_manifest.json'), JSON.stringify(stagedManifest, null, 2), 'utf8');

    // Rebuild website (in batch mode, forceDeployImmediate=false so agencyPublisher batches up to 5 for deployment)
    const forceDeployImmediate = !isBatch;
    const builder = new WebsiteBuilder(bot, ctx.chat.id);
    const result = await builder.buildClientWebsite(clientId, forceDeployImmediate);

    return {
        clientId,
        businessName,
        industry,
        slug,
        deployedUrl: result.deployedUrl,
        photosCount: stagedManifest.featured?.length || 0
    };
}

// ==========================================
// Command: /fix <clientId> OR /fix {x:y} (Range)
// Fixes, rebuilds, and verifies leads individually or in safe batches
// ==========================================
async function handleFixLead(ctx) {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    if (ctx.chat?.id) scheduler.setChatId(ctx.chat.id);
    isFixLeadAborted = false;

    const text = ctx.message?.text || '';
    const rangeMatch = text.match(/(?:\/fix|\/build|\/build_lead|\/rebuild|fix|build)\s+[\{\[]?\s*(\d+)\s*(?:[:\-]|\s+to\s+)\s*(\d+)\s*[\}\]]?/i);
    const singleMatch = text.match(/(?:\/fix|\/build|\/build_lead|\/rebuild|fix|build)\s+(\d+)/i);

    // Case 1: Batch Range Execution (/fix {x:y} or /fix x:y)
    if (rangeMatch) {
        const rawStart = parseInt(rangeMatch[1], 10);
        const rawEnd = parseInt(rangeMatch[2], 10);
        const startId = Math.min(rawStart, rawEnd);
        const endId = Math.max(rawStart, rawEnd);
        const count = endId - startId + 1;

        if (count > 30) {
            return ctx.reply(
                `⚠️ *[Safety Guard Triggered]* Range \`${startId}:${endId}\` (${count} leads) exceeds the maximum safe batch size of *30 leads*.\n\n` +
                `• *Why?* Running >30 leads risks Vercel daily deployment quota lockout (100/day) and Google Maps anti-bot IP blocks.\n` +
                `• *Recommended:* Process in daily waves of up to 30 leads (e.g. \`/fix {${startId}:${startId + 29}}\`).\n\n` +
                `_Please specify a batch of 30 leads or fewer._`,
                { parse_mode: 'Markdown' }
            );
        }

        await ctx.reply(
            `🚀 *Starting Batch Vision AI Fix for Leads #${startId} to #${endId} (${count} leads)...*\n` +
            `_Safety pacing: 5s pause between builds, batching Vercel deployments every 5 leads._\n` +
            `💡 _Send \`/abort\` at any time to halt the batch._`,
            { parse_mode: 'Markdown' }
        );

        const fsMod = await import('fs');
        const pathMod = await import('path');
        const { agencyPublisher } = await import('../src/agency_publisher.js');

        let allLeadsCache = [];
        const latestJsonPath = pathMod.join(process.cwd(), 'data_exports', 'crm_leads_latest.json');
        if (fsMod.existsSync(latestJsonPath)) {
            try {
                allLeadsCache = JSON.parse(fsMod.readFileSync(latestJsonPath, 'utf8'));
            } catch (e) {}
        }

        const successList = [];
        const failedList = [];
        const skippedList = [];

        for (let currentId = startId; currentId <= endId; currentId++) {
            if (isFixLeadAborted) {
                await ctx.reply(`🛑 *[Batch Fix Aborted]* Halting at Lead #${currentId} per user abort signal.`);
                break;
            }

            const progressIdx = currentId - startId + 1;
            const targetLead = allLeadsCache.find(l => Number(l['Client ID']) === currentId);
            const leadName = targetLead ? targetLead['Business Name'] : `Lead #${currentId}`;

            await ctx.reply(`🔨 *[${progressIdx}/${count}] Fixing Lead #${currentId} (${leadName})...*`, { parse_mode: 'Markdown' });

            try {
                const res = await fixLeadCore(currentId, ctx, { isBatch: true, allLeadsCache });
                successList.push(res);
                console.log(`[BatchFix] ✅ Lead #${currentId} (${res.businessName}) completed.`);
            } catch (err) {
                if (err.message.includes('not found in CRM')) {
                    skippedList.push({ id: currentId, reason: 'Not found in CRM' });
                    await ctx.reply(`⏭️ _Lead #${currentId} skipped (not found in CRM)._`, { parse_mode: 'Markdown' });
                } else {
                    failedList.push({ id: currentId, error: err.message });
                    console.error(`[BatchFix] ❌ Lead #${currentId} failed:`, err.message);
                    await ctx.reply(`⚠️ _Lead #${currentId} error: ${err.message}_`, { parse_mode: 'Markdown' });
                }
            }

            // 5-second rate-limit cooling pause between items
            if (currentId < endId && !isFixLeadAborted) {
                await new Promise(r => setTimeout(r, 5000));
            }
        }

        // Deploy any remaining items left in agencyPublisher queue
        if (agencyPublisher.batchQueue.length > 0 && !isFixLeadAborted) {
            await ctx.reply(`📦 *Deploying final batch of ${agencyPublisher.batchQueue.length} leads to Vercel...*`, { parse_mode: 'Markdown' });
            try {
                await agencyPublisher.deployBatch(async (msg) => ctx.reply(msg));
            } catch (deployErr) {
                console.error('[BatchFix] Final deploy notice:', deployErr.message);
            }
        }

        // Send Final Summary Report
        await ctx.reply(
            `🎉 *Batch Fix Completed for Range #${startId} to #${endId}!*\n\n` +
            `• *Total Processed:* ${count}\n` +
            `• ✅ *Successfully Rebuilt:* ${successList.length}\n` +
            `• ❌ *Failed:* ${failedList.length}\n` +
            `• ⏭️ *Skipped / Not in CRM:* ${skippedList.length}\n\n` +
            (successList.length > 0 ? `🔗 *Sample Deployed URL:* ${successList[0].deployedUrl}\n` : '') +
            (failedList.length > 0 ? `⚠️ *Failed Lead IDs:* ${failedList.map(f => `#${f.id}`).join(', ')}` : ''),
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Case 2: Single Lead Execution (/fix <clientId>)
    if (singleMatch) {
        const clientId = parseInt(singleMatch[1], 10);
        if (!clientId || isNaN(clientId)) {
            return ctx.reply("❌ Please provide a valid Client ID.\n\nExample: `/fix 202` or `/fix {1:10}`", { parse_mode: 'Markdown' });
        }

        await ctx.reply(`🧠 *Starting Vision AI Fix for Lead #${clientId}...*\n_Extracting photos, running Gemini Vision filtering, and rebuilding with verified design standards._`, { parse_mode: 'Markdown' });

        try {
            const res = await fixLeadCore(clientId, ctx, { isBatch: false });
            await ctx.reply(
                `🎉 *Lead #${clientId} (${res.businessName}) Fixed Successfully!*\n\n` +
                `🔗 *Live Agency URL:* ${res.deployedUrl}\n` +
                `📦 *Local Directory:* \`web-dev-agency/public/sites/${res.slug}/index.html\`\n` +
                `📸 *Authentic Assets:* ${res.photosCount} verified photos staged.`,
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('[FixLead] Error:', err);
            ctx.reply(`❌ Failed to fix Lead #${clientId}: ${err.message}`);
        }
        return;
    }

    // Case 3: Missing Argument / Help
    return ctx.reply(
        `❌ *Please provide a valid Client ID or Range.*\n\n` +
        `Examples:\n` +
        `• *Single Lead:* \`/fix 202\` or \`/build 202\`\n` +
        `• *Range Batch:* \`/fix {1:10}\`, \`/fix 1:10\`, or \`/fix 20-30\` (max 30 per batch)`,
        { parse_mode: 'Markdown' }
    );
}

bot.command('fix', handleFixLead);
bot.command('build', handleFixLead);
bot.command('fix_lead', handleFixLead);
bot.command('build_lead', handleFixLead);
bot.command('rebuild', handleFixLead);

async function handleLlmCommand(ctx) {
    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    const arg = parts[1]?.toLowerCase();

    const settingsPath = path.join(process.cwd(), 'scraper', 'config', 'settings.json');
    let settings = {};
    if (fs.existsSync(settingsPath)) {
        try {
            settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        } catch (e) {}
    }
    if (!settings.llm) settings.llm = {};

    if (!arg) {
        const currentMode = settings.llm.provider_mode || 'default';
        const primaryProvider = settings.llm.primary_provider || 'gemini';
        return ctx.reply(
            `🤖 *[LLM Provider Status]*\n\n` +
            `• *Active Mode:* \`${currentMode}\`\n` +
            `• *Primary Provider:* \`${primaryProvider}\`\n` +
            `• *Gemini Model:* \`${settings.llm.primary_model || 'gemini-flash-lite-latest'}\`\n` +
            `• *Top Fallback Model:* \`${settings.llm.fallback_models?.[0] || 'N/A'}\`\n\n` +
            `_To switch modes, run:_\n` +
            `• \`/llm default\` (Gemini Primary + OpenRouter Fallback)\n` +
            `• \`/llm openrouter\` (OpenRouter Free Cascade + Gemini Fallback)\n` +
            `• \`/llm gemini\` (Strict Gemini Only)`,
            { parse_mode: 'Markdown' }
        );
    }

    if (!['default', 'openrouter', 'gemini'].includes(arg)) {
        return ctx.reply("❌ Invalid mode. Usage: `/llm [default|openrouter|gemini]`", { parse_mode: 'Markdown' });
    }

    settings.llm.provider_mode = arg;
    settings.llm.primary_provider = (arg === 'openrouter' ? 'openrouter' : 'gemini');
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4), 'utf8');
    } catch (e) {
        return ctx.reply(`❌ Failed to save settings: ${e.message}`);
    }

    let modeLabel = 'Default Schema (Gemini Primary + OpenRouter Fallback)';
    if (arg === 'openrouter') {
        modeLabel = 'OpenRouter (Free Cascade Primary + Gemini Fallback)';
    } else if (arg === 'gemini') {
        modeLabel = 'Gemini (Strict Gemini Only)';
    }

    webUI.io.emit('llm_provider_changed', {
        mode: arg,
        primary_provider: settings.llm.primary_provider,
        label: modeLabel
    });

    return ctx.reply(`✅ *[LLM Provider Switched]*\n\nActive operations set to: \`${modeLabel}\``, { parse_mode: 'Markdown' });
}

bot.command('llm', handleLlmCommand);
bot.command('model', handleLlmCommand);
bot.command('provider', handleLlmCommand);

// QA Site Auditor: /audit_sites [start] [end] [fix]
async function handleAuditSites(ctx) {
    const text = ctx.message?.text || '';
    const autoFix = /fix|--fix|-f/i.test(text);

    // Matches /audit_sites 500 600 or /audit_sites 500:600 or /audit_sites 500-600 or /audit_sites [500:600]
    const rangeMatch = text.match(/(?:\/audit_sites|\/check_sites|\/qa_sites|\/qa)\s+[\{\[]?\s*(\d+)\s*(?:[:\-]|\s+to\s+|\s+)\s*(\d+)\s*[\}\]]?/i);
    const singleMatch = text.match(/(?:\/audit_sites|\/check_sites|\/qa_sites|\/qa)\s+(\d+)/i);

    let start = 1;
    let end = 600;
    if (rangeMatch) {
        start = parseInt(rangeMatch[1], 10);
        end = parseInt(rangeMatch[2], 10);
    } else if (singleMatch) {
        start = parseInt(singleMatch[1], 10);
        end = start;
    }

    if (start > end) {
        const tmp = start;
        start = end;
        end = tmp;
    }

    await ctx.reply(
        `🔍 *[Site QA Auditor]* Initializing deep visual, asset, and code integrity audit...\n` +
        `• *Target Range:* Leads \`#${start}\` to \`#${end}\` (${end - start + 1} sites)\n` +
        `• *Auto-Fix Mode:* \`${autoFix ? 'ENABLED 🛠️' : 'READ-ONLY 👁️'}\`\n\n` +
        `_Testing image reachability, closing tags, template leaks, and mobile viewport clearance..._`,
        { parse_mode: 'Markdown' }
    );

    const { SiteQAAuditor } = await import('../src/qa_auditor.js');
    const auditor = new SiteQAAuditor();
    let lastProgressTime = Date.now();

    const summary = await auditor.auditRange(start, end, {
        autoFix,
        onProgress: async (p) => {
            if (p.completed % 10 === 0 || p.completed === p.total) {
                if (Date.now() - lastProgressTime > 2500 || p.completed === p.total) {
                    lastProgressTime = Date.now();
                    const statusIcon = p.latestResult.status === 'PASS' ? '🟢' : (p.latestResult.status === 'WARN' ? '⚠️' : '🔴');
                    await ctx.reply(
                        `⏳ *[QA Audit Progress: ${p.percent}%]* (${p.completed}/${p.total})\n` +
                        `• *Latest Lead (#${p.currentId}):* ${statusIcon} \`${p.latestResult.businessName}\` [${p.latestResult.status}]`,
                        { parse_mode: 'Markdown' }
                    );
                }
            }
        }
    });

    const reportMd = auditor.formatSummaryMarkdown(summary);
    await ctx.reply(reportMd, { parse_mode: 'Markdown' });
}

bot.command('audit_sites', handleAuditSites);
bot.command('check_sites', handleAuditSites);
bot.command('qa_sites', handleAuditSites);
bot.command('qa', handleAuditSites);

// Direct text listener: Automatically detect when user pastes a Google Maps link into chat
bot.on('text', async (ctx, next) => {
    const text = ctx.message?.text || '';
    if (text.startsWith('/')) return next(); // Ignore standard commands
    const mapsRegex = /(https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)[^\s]+)/i;
    const match = text.match(mapsRegex);
    if (match) {
        return handleBuildUrl(ctx, match[1]);
    }
    return next();
});

// Launch Bot
console.log("==================================================");
console.log(`[ControllerBot] 🚀 Starting Controller Bot on token: ${CONFIG.BOT_TOKEN.slice(0, 10)}...`);
console.log("==================================================");

scheduler = new Scheduler(bot, null);
scheduler.start();
webUI.setScheduler(scheduler);

// Periodic broadcast of busy/idle process status to keep UI lock tightly synced
setInterval(() => {
    try {
        if (webUI.io) {
            webUI.io.emit('process_status', webUI.getBusyStatus());
        }
    } catch (e) {}
}, 2000);

webUI.start();
bot.launch({
    dropPendingUpdates: false
}).catch(err => {
    console.error("[ControllerBot] ❌ Polling error:", err.message);
    console.log("[ControllerBot] ⚠️ Telegram failed to start. Web UI is still active.");
});

console.log("[ControllerBot] ✅ Telegram Bot is actively listening for messages & commands!");

// 24/7 Resilience Failsafes: Global Process-Level Safety Nets
process.on('uncaughtException', (err) => {
    console.error('[Process Watchdog] ⚠️ Uncaught Exception caught cleanly:', err.message, err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Process Watchdog] ⚠️ Unhandled Promise Rejection caught cleanly:', reason);
});

// Enable graceful stop
process.once('SIGINT', () => {
    if (scheduler) scheduler.stop();
    try { bot.stop('SIGINT'); } catch (e) {} process.exit(0);
});
process.once('SIGTERM', () => {
    if (scheduler) scheduler.stop();
    try { bot.stop('SIGTERM'); } catch (e) {} process.exit(0);
});
