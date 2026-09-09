import { Telegraf, Markup } from 'telegraf';
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
        ]
    ]);
}

// Global logger & chat ID detector middleware
bot.use(async (ctx, next) => {
    const text = ctx.message?.text || ctx.callbackQuery?.data || '';
    console.log(`[ControllerBot] 📩 Update: ${ctx.updateType} from chat ${ctx.chat?.id} (@${ctx.from?.username || ctx.from?.first_name || 'User'}): "${text}"`);
    
    if (ctx.chat?.id) {
        masterChatId = ctx.chat.id;
        if (!scheduler) {
            scheduler = new Scheduler(bot, masterChatId);
            scheduler.start();
        } else {
            scheduler.setChatId(masterChatId);
        }
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
bot.start(async (ctx) => {
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
        `• ⚙️ Pipeline/Builder: ${s.isPipelineRunning ? '🟡 Building / Dispatching Active' : '⚪ Idle'}\n\n` +
        `*Daily Cron Schedule (Asia/Kolkata):*\n` +
        `• 09:30 AM: ⚡ Real-time Stream Scrape & Build (35 Leads)\n` +
        `• 10:30 AM: ⚙️ Safety Sweep Analysis\n` +
        `• 12:00 PM: 📲 Morning WhatsApp Dispatch Wave (${plan?.tasks.dispatchWave1.batchSize || 18} msgs)\n` +
        `• 04:30 PM: 📲 Afternoon WhatsApp Dispatch Wave (${plan?.tasks.dispatchWave2.batchSize || 17} msgs)\n` +
        `• 06:00 PM: 📞 Evening Follow-Up Phone Calls & Scripts`;

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
        `🎯 *Target Niche & City:* ${plan.focus}\n\n` +
        `🔍 *Search Query:* \`${plan.tasks.scraper.query}\` (${plan.tasks.scraper.locality})\n` +
        `🎯 *Target Volume:* ${plan.tasks.scraper.targetLeads} leads\n\n` +
        `*Scheduled Timetable:*\n` +
        `• 09:30 AM: ⚡ Stream Scrape & Build\n` +
        `• 12:00 PM: 📲 WhatsApp Wave 1 (${plan.tasks.dispatchWave1.batchSize} leads)\n` +
        `• 04:30 PM: 📲 WhatsApp Wave 2 (${plan.tasks.dispatchWave2.batchSize} leads)\n` +
        `• 06:00 PM: 📞 Follow-up Calling Window\n\n` +
        `💡 *Phone Close Script:*\n` +
        `_"${CONFIG.loadPlan()?.phoneScriptTemplates?.courtesyOpener || 'Hi [Owner], Maine aapke business ke liye live website concept share kiya tha...'}"_`;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
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
    const city = args[1] || plan?.tasks.scraper.city || "Pune";
    const count = parseInt(args[2], 10) || 1;

    await ctx.reply(
        `🚀 *Launching Complete 360° Acquisition Pipeline for ${count} lead(s)...*\n\n` +
        `📍 *Niche:* \`${query}\`\n` +
        `🏙️ *City:* \`${city}\`\n` +
        `⚡ *Stages:* Scrape ➔ 14-Point Audit ➔ Build Website ➔ Deploy to Vercel ➔ Send WhatsApp Message\n` +
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
        `📅 *Upcoming Timetable for Today:*\n` +
        `• 09:30 AM: ⚡ Stream Scrape & Build (${plan?.tasks.scraper.targetLeads || 35} leads)\n` +
        `• 12:00 PM: 📲 WhatsApp Wave 1 (${plan?.tasks.dispatchWave1.batchSize || 18} msgs)\n` +
        `• 04:30 PM: 📲 WhatsApp Wave 2 (${plan?.tasks.dispatchWave2.batchSize || 17} msgs)\n` +
        `• 06:00 PM: 📞 Follow-up Call Alert`,
        { parse_mode: 'Markdown', ...getMainKeyboard(true) }
    );
}

bot.command('reset_plan', handleResetResumePlan);
bot.command('resume_plan', handleResetResumePlan);
bot.command('abort_and_resume', handleResetResumePlan);

// Command: /abort and /stop
async function handleAbort(ctx) {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.setChatId(ctx.chat.id);

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

// Command: /trigger_stream [query] [city] [count]
bot.command('trigger_stream', async (ctx) => {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.setChatId(ctx.chat.id);

    const args = parseArgs(ctx.message.text);
    const plan = scheduler.getTodayPlan();
    const query = args[0] || plan?.tasks.scraper.query || "Gyms";
    const city = args[1] || plan?.tasks.scraper.city || "Pune";
    const count = parseInt(args[2], 10) || plan?.tasks.scraper.targetLeads || 35;

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
        `• ⚙️ Pipeline/Builder: ${s.isPipelineRunning ? '🟡 Building / Dispatching Active' : '⚪ Idle'}\n\n` +
        `*Daily Cron Schedule:*\n` +
        `• 09:30 AM: ⚡ Real-Time Stream Scrape & Build (35 Leads)\n` +
        `• 10:30 AM: ⚙️ Safety Sweep Analysis\n` +
        `• 12:00 PM: 📲 Morning WhatsApp Dispatch (${plan?.tasks.dispatchWave1.batchSize || 18} msgs)\n` +
        `• 04:30 PM: 📲 Afternoon WhatsApp Dispatch (${plan?.tasks.dispatchWave2.batchSize || 17} msgs)\n` +
        `• 06:00 PM: 📞 Evening Follow-up Call Reminder`,
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
        `🎯 *Target:* ${plan?.focus}\n` +
        `🔍 *Scrape Query:* \`${plan?.tasks.scraper.query}\` (${plan?.tasks.scraper.locality})\n` +
        `📊 *Target Leads:* ${plan?.tasks.scraper.targetLeads}\n` +
        `📲 *WhatsApp Waves:* 12:00 PM (${plan?.tasks.dispatchWave1.batchSize}) & 04:30 PM (${plan?.tasks.dispatchWave2.batchSize})\n` +
        `📞 *Follow-Up Window:* 06:00 PM (Target: ${plan?.tasks.followUpReview.targetCloses || 1} deal)`,
        { parse_mode: 'Markdown' }
    );
});

bot.action('cmd_run_full_1', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    const plan = scheduler.getTodayPlan();
    const query = plan?.tasks.scraper.query || "Gyms";
    const city = plan?.tasks.scraper.city || "Pune";

    await ctx.reply(
        `🚀 *Launching Complete 360° Acquisition Pipeline for 1 lead...*\n\n` +
        `📍 *Niche:* \`${query}\`\n` +
        `🏙️ *City:* \`${city}\`\n` +
        `⚡ *Stages:* Scrape ➔ 14-Point Audit ➔ Build Website ➔ Deploy to Vercel ➔ Send WhatsApp Message\n` +
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

bot.action('cmd_view_plan', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    await ctx.reply(
        `📜 *Weekly Acquisition Blueprint JSON*\n\n` +
        `File Path: \`plan/week_1_plan.json\`\n\n` +
        `To modify daily search targets or timings, edit \`plan/week_1_plan.json\` and send \`/start\` to reload.`,
        { parse_mode: 'Markdown' }
    );
});

// Launch Bot
console.log("==================================================");
console.log(`[ControllerBot] 🚀 Starting Controller Bot on token: ${CONFIG.BOT_TOKEN.slice(0, 10)}...`);
console.log("==================================================");

scheduler = new Scheduler(bot, null);
scheduler.start();

webUI.start();
bot.launch({
    dropPendingUpdates: false
}).catch(err => {
    console.error("[ControllerBot] ❌ Polling error:", err.message);
    console.log("[ControllerBot] ⚠️ Telegram failed to start. Web UI is still active.");
});

console.log("[ControllerBot] ✅ Telegram Bot is actively listening for messages & commands!");

// Enable graceful stop
process.once('SIGINT', () => {
    if (scheduler) scheduler.stop();
    try { bot.stop('SIGINT'); } catch (e) {} process.exit(0);
});
process.once('SIGTERM', () => {
    if (scheduler) scheduler.stop();
    try { bot.stop('SIGTERM'); } catch (e) {} process.exit(0);
});
