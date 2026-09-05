# 🤖 24/7 Autonomous Controller Bot & Scheduler

This bot operates in the `controller_bot/` subfolder and serves as the master autonomous controller for the entire client acquisition engine.

---

## 🎯 What It Does

1. **Reads Machine Schedule:** Reads `plan/week_1_plan.json` for daily target queries, lead counts, and timed automation waves.
2. **Automates Scraper:** Programmatically invokes `gmaps-scraper-Indian` every morning at 09:30 AM.
3. **Automates Website Builder & Vercel Deployer:** Auto-generates 14-point audits, builds responsive mobile-first sites, and deploys to Vercel with clean business slugs at 10:30 AM.
4. **Automates WhatsApp Waves:** Dispatches rate-limited WhatsApp curiosity messages with live Vercel links at 12:00 PM and 04:30 PM.
5. **Evening Call Check-in:** Sends structured reminders and follow-up call scripts at 06:00 PM.
6. **Remote Control via Telegram:** Full interactive dashboard with inline buttons to pause/resume automation, view live status, or manually trigger any step.

---

## 🚀 How to Run Locally or on a Server

```bash
# From workspace root
node controller_bot/index.js
```

### Running 24/7 with PM2 (Recommended for Servers / VPS):
```bash
# Install PM2 globally (if not installed)
npm install -g pm2

# Start controller bot with auto-restart
pm2 start controller_bot/index.js --name "arclane-controller-bot"

# View logs
pm2 logs arclane-controller-bot
```

---

## 📱 Telegram Bot Commands

Bot Token: `[REDACTED_TELEGRAM_TOKEN]`

| Command | Action |
| :--- | :--- |
| `/start` or `/menu` | Opens interactive dashboard with inline control buttons. |
| `/status` | Shows live task state, current automation status, and next scheduled events. |
| `/today` | Shows today's targeted query, city, and timetable. |
| `/start_auto` | Activates autonomous 24/7 cron engine. |
| `/pause_auto` | Pauses scheduled cron triggers (manual triggers still work). |
| `/trigger_scrape [query] [city] [count]` | Manually triggers scraping on demand. |
| `/trigger_analyse [count]` | Manually triggers batch analysis & website builds for new leads. |
| `/trigger_send [count]` | Manually triggers a WhatsApp dispatch wave. |

---

## 🛡️ Decoupled Architecture

* **The human-based Telegram bot (`node src/index.js`) and scraper bot (`gmaps-scraper-Indian/telegram_bot.py`) remain completely independent.**
* If the controller bot is stopped, you can still operate all scraper and reporting tools manually as originally designed.
