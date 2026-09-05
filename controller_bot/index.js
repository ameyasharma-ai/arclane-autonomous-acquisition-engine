import { Telegraf, Markup } from 'telegraf';
import { CONFIG } from './config.js';
import { Scheduler } from './scheduler.js';

const bot = new Telegraf(CONFIG.BOT_TOKEN);
let scheduler = null;
let masterChatId = null;

// Helper to build main interactive keyboard
function getMainKeyboard(isAuto = true) {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('📊 Live Status', 'cmd_status'),
            Markup.button.callback('📅 Today\'s Plan', 'cmd_today')
        ],
        [
            Markup.button.callback('🔍 Trigger Scrape', 'cmd_manual_scrape'),
            Markup.button.callback('⚙️ Trigger Analyse & Build', 'cmd_manual_analyse')
        ],
        [
            Markup.button.callback('📲 Trigger WhatsApp Dispatch', 'cmd_manual_send')
        ],
        [
            isAuto 
                ? Markup.button.callback('⏸ Pause Automation', 'cmd_pause_auto')
                : Markup.button.callback('▶️ Resume Automation', 'cmd_resume_auto'),
            Markup.button.callback('📜 View Schedule JSON', 'cmd_view_plan')
        ]
    ]);
}

bot.start(async (ctx) => {
    masterChatId = ctx.chat.id;
    if (!scheduler) {
        scheduler = new Scheduler(bot, masterChatId);
        scheduler.start();
    } else {
        scheduler.setChatId(masterChatId);
    }

    const status = scheduler.getStatus();

    await ctx.reply(
        `🤖 *Arclane 24/7 Autonomous Controller Bot*\n\n` +
        `Welcome! I autonomously manage your entire client acquisition pipeline:\n` +
        `• *Google Maps Scraper:* Automatic daily lead generation\n` +
        `• *BI Intelligence & Builder:* 14-point audit & responsive website building\n` +
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
        `*Daily Cron Schedule:*\n` +
        `• 09:30 AM: Scrape 35 ${plan?.tasks.scraper.query || 'Leads'}\n` +
        `• 10:30 AM: Analyse & Build Vercel Websites\n` +
        `• 12:00 PM: Morning WhatsApp Dispatch (18 msgs)\n` +
        `• 04:30 PM: Afternoon WhatsApp Dispatch (17 msgs)\n` +
        `• 06:00 PM: Evening Follow-up Call Reminder`;

    await ctx.reply(msg, {
        parse_mode: 'Markdown',
        ...getMainKeyboard(s.isAutoRunning)
    });
});

// Command: /today
bot.command('today', async (ctx) => {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    const plan = scheduler.getTodayPlan();
    if (!plan) return ctx.reply("⚠️ Could not load schedule plan.");

    const msg = 
        `📅 *Today's Schedule Plan: ${plan.dayName}*\n\n` +
        `🎯 *Industry Focus:* ${plan.focus}\n\n` +
        `*Scheduled Timings:*\n` +
        `• *09:30 AM:* Scrape \`${plan.tasks.scraper.query}\` (${plan.tasks.scraper.locality})\n` +
        `• *10:30 AM:* Auto-Analyse & Build (up to ${plan.tasks.analyseAndBuild.maxLeadsToProcess} leads)\n` +
        `• *12:00 PM:* Wave 1 WhatsApp Dispatch (${plan.tasks.dispatchWave1.batchSize} leads)\n` +
        `• *04:30 PM:* Wave 2 WhatsApp Dispatch (${plan.tasks.dispatchWave2.batchSize} leads)\n` +
        `• *06:00 PM:* Follow-Up Call Window (${plan.tasks.followUpReview.targetCalls || 15} calls, Goal: ${plan.tasks.followUpReview.targetCloses || 1} close)\n\n` +
        `📝 *Notes:* ${plan.tasks.followUpReview.notes}`;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
});

// Command: /start_auto
bot.command('start_auto', async (ctx) => {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.setChatId(ctx.chat.id);
    scheduler.resume();
    await ctx.reply("🟢 *Autonomous 24/7 Cron Engine Activated!* Daily tasks will run on schedule.", {
        parse_mode: 'Markdown',
        ...getMainKeyboard(true)
    });
});

// Command: /pause_auto
bot.command('pause_auto', async (ctx) => {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.pause();
    await ctx.reply("⏸ *Automation Paused.* Cron triggers will not run until resumed. You can still trigger tasks manually.", {
        parse_mode: 'Markdown',
        ...getMainKeyboard(false)
    });
});

// Helper for quoted argument parsing (e.g. /trigger_scrape "Dental Clinics" Gurugram 20)
function parseArgs(text) {
    const match = text.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g);
    if (!match) return [];
    return match.map(arg => arg.replace(/^['"]|['"]$/g, '')).slice(1);
}

// Command: /trigger_scrape [query] [city] [count]
bot.command('trigger_scrape', async (ctx) => {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.setChatId(ctx.chat.id);

    const args = parseArgs(ctx.message.text);
    const query = args[0] || "Gyms";
    const city = args[1] || "Pune";
    const count = parseInt(args[2], 10) || 35;

    await ctx.reply(`🚀 Manually triggering scrape for *${query}* in *${city}* (${count} leads)...`, { parse_mode: 'Markdown' });
    scheduler.scraperRunner.runScrape({
        query,
        locality: `in ${city}`,
        city,
        targetLeads: count
    }).catch(e => ctx.reply(`❌ Scrape error: ${e.message}`));
});

// Command: /trigger_analyse [maxLeads]
bot.command('trigger_analyse', async (ctx) => {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.setChatId(ctx.chat.id);

    const args = ctx.message.text.split(' ').slice(1);
    const count = parseInt(args[0], 10) || 35;

    await ctx.reply(`🚀 Manually triggering batch analysis & website build (max ${count} leads)...`, { parse_mode: 'Markdown' });
    scheduler.pipelineRunner.runAnalyseAndBuild(count).catch(e => ctx.reply(`❌ Analysis error: ${e.message}`));
});

// Command: /trigger_send [count]
bot.command('trigger_send', async (ctx) => {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    scheduler.setChatId(ctx.chat.id);

    const args = ctx.message.text.split(' ').slice(1);
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
        `• 09:30 AM: Scrape 35 ${plan?.tasks.scraper.query || 'Leads'}\n` +
        `• 10:30 AM: Analyse & Build Vercel Websites\n` +
        `• 12:00 PM: Morning WhatsApp Dispatch (18 msgs)\n` +
        `• 04:30 PM: Afternoon WhatsApp Dispatch (17 msgs)\n` +
        `• 06:00 PM: Evening Follow-up Call Reminder`,
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

bot.action('cmd_manual_scrape', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    const plan = scheduler.getTodayPlan();
    const query = plan?.tasks.scraper.query || "Gyms";
    const city = plan?.tasks.scraper.city || "Pune";
    const count = plan?.tasks.scraper.targetLeads || 35;

    await ctx.reply(`🚀 Starting manual scrape for *${query}* in *${city}* (${count} leads)...`, { parse_mode: 'Markdown' });
    scheduler.scraperRunner.runScrape({
        query,
        locality: `in ${city}`,
        city,
        targetLeads: count
    }).catch(e => ctx.reply(`❌ Scrape error: ${e.message}`));
});

bot.action('cmd_manual_analyse', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat.id);
    await ctx.reply(`🚀 Starting manual analysis & website builds for new leads...`, { parse_mode: 'Markdown' });
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
        `File Path: \`plan/week_1_plan.json\`\n` +
        `HTML Dashboard: \`plan/week_1_plan.html\`\n\n` +
        `To modify daily search targets or timings, edit \`plan/week_1_plan.json\` and send \`/start\` to reload.`,
        { parse_mode: 'Markdown' }
    );
});

// Launch Bot
console.log("==================================================");
console.log(`[ControllerBot] 🚀 Starting Controller Bot on token: ${CONFIG.BOT_TOKEN.slice(0, 10)}...`);
console.log("==================================================");

bot.launch().then(() => {
    console.log("[ControllerBot] ✅ Telegram Bot connected and listening!");
    // Initialize scheduler immediately
    scheduler = new Scheduler(bot, null);
    scheduler.start();
}).catch(err => {
    console.error("[ControllerBot] ❌ Failed to launch Telegram Bot:", err.message);
});

// Enable graceful stop
process.once('SIGINT', () => {
    if (scheduler) scheduler.stop();
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    if (scheduler) scheduler.stop();
    bot.stop('SIGTERM');
});
