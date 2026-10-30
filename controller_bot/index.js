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
