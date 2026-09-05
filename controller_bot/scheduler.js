import cron from 'node-cron';
import { CONFIG } from './config.js';
import { ScraperRunner } from './scraper_runner.js';
import { PipelineRunner } from './pipeline_runner.js';

export class Scheduler {
    constructor(telegramBot, chatId) {
        this.bot = telegramBot;
        this.chatId = chatId;
        this.scraperRunner = new ScraperRunner(telegramBot, chatId);
        this.pipelineRunner = new PipelineRunner(telegramBot, chatId);
        this.cronJobs = [];
        this.isAutoRunning = true;
        this.plan = CONFIG.loadPlan();
    }

    setChatId(chatId) {
        this.chatId = chatId;
        this.scraperRunner.chatId = chatId;
        this.pipelineRunner.chatId = chatId;
    }

    async sendTelegram(msg) {
        if (this.bot && this.chatId) {
            try {
                await this.bot.telegram.sendMessage(this.chatId, msg, { parse_mode: 'Markdown' });
            } catch (e) {
                console.error("[Scheduler] Telegram notification error:", e.message);
            }
        }
    }

    getTodayPlan() {
        if (!this.plan) this.plan = CONFIG.loadPlan();
        if (!this.plan || !this.plan.dailySchedule) return null;

        // Current day in Indian timezone
        const now = new Date();
        const indianDayIndex = new Date(now.toLocaleString("en-US", { timeZone: CONFIG.TIMEZONE })).getDay();
        // JavaScript getDay(): 0 is Sunday, 1 is Monday...
        const planIndex = indianDayIndex === 0 ? 7 : indianDayIndex;

        return this.plan.dailySchedule.find(d => d.dayIndex === planIndex) || this.plan.dailySchedule[0];
    }

    start() {
        this.stop(); // Clear any existing cron jobs
        this.isAutoRunning = true;

        console.log(`[Scheduler] 🚀 Starting 24/7 Automation Scheduler (Timezone: ${CONFIG.TIMEZONE})...`);

        // 1. Daily Scraping Job (09:30 AM every day)
        const scrapeCron = cron.schedule('30 9 * * *', async () => {
            if (!this.isAutoRunning) return;
            const today = this.getTodayPlan();
            if (today && today.tasks.scraper.enabled) {
                try {
                    await this.scraperRunner.runScrape({
                        query: today.tasks.scraper.query,
                        locality: today.tasks.scraper.locality,
                        city: today.tasks.scraper.city,
                        targetLeads: today.tasks.scraper.targetLeads
                    });
                } catch (e) {
                    console.error("[Scheduler] Scheduled scrape error:", e);
                }
            }
        }, { timezone: CONFIG.TIMEZONE });
        this.cronJobs.push(scrapeCron);

        // 2. Daily Analysis & Website Build Job (10:30 AM every day)
        const analyseCron = cron.schedule('30 10 * * *', async () => {
            if (!this.isAutoRunning) return;
            const today = this.getTodayPlan();
            if (today && today.tasks.analyseAndBuild.enabled) {
                try {
                    await this.pipelineRunner.runAnalyseAndBuild(today.tasks.analyseAndBuild.maxLeadsToProcess || 35);
                } catch (e) {
                    console.error("[Scheduler] Scheduled analysis error:", e);
                }
            }
        }, { timezone: CONFIG.TIMEZONE });
        this.cronJobs.push(analyseCron);

        // 3. Morning WhatsApp Dispatch Wave (12:00 PM every day)
        const wave1Cron = cron.schedule('0 12 * * *', async () => {
            if (!this.isAutoRunning) return;
            const today = this.getTodayPlan();
            if (today && today.tasks.dispatchWave1.enabled) {
                try {
                    await this.pipelineRunner.runDispatchWave(today.tasks.dispatchWave1.batchSize || 18);
                } catch (e) {
                    console.error("[Scheduler] Scheduled wave 1 error:", e);
                }
            }
        }, { timezone: CONFIG.TIMEZONE });
        this.cronJobs.push(wave1Cron);

        // 4. Afternoon WhatsApp Dispatch Wave (04:30 PM every day)
        const wave2Cron = cron.schedule('30 16 * * *', async () => {
            if (!this.isAutoRunning) return;
            const today = this.getTodayPlan();
            if (today && today.tasks.dispatchWave2.enabled) {
                try {
                    await this.pipelineRunner.runDispatchWave(today.tasks.dispatchWave2.batchSize || 17);
                } catch (e) {
                    console.error("[Scheduler] Scheduled wave 2 error:", e);
                }
            }
        }, { timezone: CONFIG.TIMEZONE });
        this.cronJobs.push(wave2Cron);

        // 5. Evening Follow-Up & Call Reminder (06:00 PM every day)
        const followUpCron = cron.schedule('0 18 * * *', async () => {
            if (!this.isAutoRunning) return;
            const today = this.getTodayPlan();
            if (today && today.tasks.followUpReview.enabled) {
                await this.sendTelegram(
                    `📞 *[Controller] Evening Follow-Up Call Window (06:00 PM – 07:30 PM)*\n\n` +
                    `🎯 *Today's Focus:* ${today.tasks.followUpReview.notes}\n` +
                    `☎️ *Target Calls:* ${today.tasks.followUpReview.targetCalls || 15} leads\n` +
                    `💰 *Target Closes:* ${today.tasks.followUpReview.targetCloses || 1} client(s)\n\n` +
                    `💡 *Quick Script Reminder:*\n` +
                    `_"Hi [Owner], Ameya here from Arclane Studios. Maine aapke business ke liye ek live custom website concept WhatsApp par share kiya tha. Bas ek minute check karna tha ki kya aapko link receive hua?"_`
                );
            }
        }, { timezone: CONFIG.TIMEZONE });
        this.cronJobs.push(followUpCron);

        console.log(`[Scheduler] ✅ Registered 5 daily automated cron schedules.`);
    }

    pause() {
        this.isAutoRunning = false;
        console.log(`[Scheduler] ⏸ Automation paused by user.`);
    }

    resume() {
        this.isAutoRunning = true;
        console.log(`[Scheduler] ▶️ Automation resumed.`);
    }

    stop() {
        for (const job of this.cronJobs) {
            try {
                job.stop();
            } catch (e) {}
        }
        this.cronJobs = [];
    }

    getStatus() {
        const today = this.getTodayPlan();
        const now = new Date().toLocaleTimeString('en-IN', { timeZone: CONFIG.TIMEZONE });

        return {
            isAutoRunning: this.isAutoRunning,
            timezone: CONFIG.TIMEZONE,
            currentTime: now,
            todayName: today ? today.dayName : 'N/A',
            todayFocus: today ? today.focus : 'N/A',
            isScraperRunning: this.scraperRunner.isRunning,
            isPipelineRunning: this.pipelineRunner.isProcessing
        };
    }
}
