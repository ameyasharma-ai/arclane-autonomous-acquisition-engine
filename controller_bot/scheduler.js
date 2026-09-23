import cron from 'node-cron';
import path from 'path';
import fs from 'fs';
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
        const statePath = path.join(CONFIG.ROOT_DIR, 'plan', 'engine_state.json');
        let currentDayNum = 1;
        let currentWeekNum = 1;
        try {
            if (fs.existsSync(statePath)) {
                const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
                if (state.startDate) {
                    const start = new Date(state.startDate);
                    const now = new Date();
                    const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
                    // Rotate over 70 days for 100 days continuous execution
                    currentDayNum = (diffDays % 70) + 1;
                    currentWeekNum = Math.ceil(currentDayNum / 7);
                } else if (state.currentCycleDay) {
                    currentDayNum = state.currentCycleDay;
                    currentWeekNum = Math.ceil(currentDayNum / 7);
                }
            } else {
                fs.writeFileSync(statePath, JSON.stringify({ startDate: new Date().toISOString().split('T')[0], currentCycleDay: 1 }, null, 2));
            }
        } catch (e) {
            console.warn('[Scheduler] Engine state read notice:', e.message);
        }

        const activePlan = CONFIG.loadPlan(currentWeekNum);
        if (!activePlan || !activePlan.dailySchedule) return null;

        // Match by dayNumber (1 to 70), fallback to weekday matching
        const dayPlan = activePlan.dailySchedule.find(d => d.dayNumber === currentDayNum);
        if (dayPlan) return dayPlan;

        const now = new Date();
        const indianDayIndex = new Date(now.toLocaleString("en-US", { timeZone: CONFIG.TIMEZONE })).getDay();
        const planIndex = indianDayIndex === 0 ? 7 : indianDayIndex;

        return activePlan.dailySchedule.find(d => d.dayIndex === planIndex) || activePlan.dailySchedule[0];
    }

    start() {
        this.stop(); // Clear any existing cron jobs
        this.isAutoRunning = true;

        console.log(`[Scheduler] 🚀 Starting 24/7 Automation Scheduler (Timezone: ${CONFIG.TIMEZONE})...`);
        import('../src/web_ui.js').then(({ webUI }) => webUI.broadcast(msg)).catch(()=>{});

        // 1. Daily Real-Time Streaming Scrape & Build Job (10:15 PM every night)
        // Concurrently streams each scraped lead directly into the website builder & deployer!
        const streamCron = cron.schedule('15 22 * * *', async () => {
            if (!this.isAutoRunning) return;
            const today = this.getTodayPlan();
            if (today && today.tasks.scraper.enabled) {
                try {
                    await this.pipelineRunner.runStreamingScrapeAndBuild({
                        query: today.tasks.scraper.query,
                        locality: today.tasks.scraper.locality,
                        city: today.tasks.scraper.city,
                        targetLeads: today.tasks.scraper.targetLeads,
                        scraperRunner: this.scraperRunner
                    });
                } catch (e) {
                    console.error("[Scheduler] Scheduled stream scrape & build error:", e);
                }
            }
        }, { timezone: CONFIG.TIMEZONE });
        this.cronJobs.push(streamCron);

        // 2. Safety Sweep Analysis Job (11:15 PM every night) - Catches any manually added leads
        const analyseCron = cron.schedule('15 23 * * *', async () => {
            if (!this.isAutoRunning) return;
            const today = this.getTodayPlan();
            if (today && today.tasks.analyseAndBuild.enabled) {
                try {
                    await this.pipelineRunner.runAnalyseAndBuild(today.tasks.analyseAndBuild.maxLeadsToProcess || 35);
                } catch (e) {
                    console.error("[Scheduler] Scheduled safety sweep analysis error:", e);
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
                    await this.pipelineRunner.prepareDispatchWave(today.tasks.dispatchWave1.batchSize || 18);
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
                    await this.pipelineRunner.prepareDispatchWave(today.tasks.dispatchWave2.batchSize || 17);
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
                    `📞 *[Controller] Evening Client Outreach Window (06:00 PM – 07:30 PM)*\n\n` +
                    `🎯 *Today's Focus:* ${today.tasks.followUpReview.notes}\n` +
                    `☎️ *Target Calls:* ${today.tasks.followUpReview.targetCalls || 15} leads\n` +
                    `💰 *Target Closes:* ${today.tasks.followUpReview.targetCloses || 1} client(s)\n\n` +
                    `💡 *Proven "No-Risk Free Gift" Calling Script:*\n` +
                    `_"Hi [Owner Name], Ameya Sharma calling from Arclane Studios, Patna. Maine aapke business [Business Name] ke liye ek custom mobile website concept design karke host kiya hai. Hum ye bilkul FREE gift offer kar rahe hain — main abhi WhatsApp par link bhej raha hoon. Agar pasand aaye toh hum aage discuss kar sakte hain, aur agar na bhi pasand aaye toh aap isse permanently FREE rakh sakte hain. No strings attached!"_`
                );
            }
        }, { timezone: CONFIG.TIMEZONE });
        this.cronJobs.push(followUpCron);

        console.log(`[Scheduler] ✅ Registered daily automated cron schedules (Night Scrape & Build at 10:15 PM, Safety Sweep at 11:15 PM, Manual Call Window at 6:00 PM).`);
    }

    pause() {
        this.isAutoRunning = false;
        console.log(`[Scheduler] ⏸ Automation paused by user.`);
    }

    resume() {
        this.isAutoRunning = true;
        console.log(`[Scheduler] ▶️ Automation resumed.`);
    }

    abort() {
        console.log("[Scheduler] 🛑 Aborting active scraper and pipeline processes...");
        this.scraperRunner.stop();
        this.pipelineRunner.abort();
    }

    abortAndResumePlan() {
        console.log("[Scheduler] 🛑 Aborting active tasks and resetting to scheduled 24/7 plan...");
        this.scraperRunner.stop();
        this.pipelineRunner.abort();
        
        setTimeout(() => {
            this.pipelineRunner.reset();
            this.isAutoRunning = true;
            console.log("[Scheduler] 🟢 Scheduler is back in pristine 24/7 automatic timetable mode.");
        }, 1000);
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
