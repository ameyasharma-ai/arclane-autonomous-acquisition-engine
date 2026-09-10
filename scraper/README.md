# Antigravity Google Maps AI Scraper

![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)
![Status](https://img.shields.io/badge/status-Production_Ready-success.svg)
![Architecture](https://img.shields.io/badge/architecture-Self_Healing-orange.svg)

A military-grade, self-healing Google Maps scraping pipeline designed for massive, multi-day data extraction operations. It combines Playwright's headless browser automation with multi-model AI inference (Gemini + OpenRouter) to generate hyper-personalized sales outreach hooks from business reviews and deep website crawls.

The entire system is remotely controlled and monitored via a robust Telegram Bot command center.

---

## 🏗️ System Architecture

The codebase is split into three main operational pillars:

### 1. The Command Center (`telegram_bot.py`)
This is the heart of the operation. It acts as an asynchronous Telegram server that listens for commands from your phone. When instructed, it spawns scraper subprocesses. 
**Key Feature (The Watchdog):** The bot actively monitors the `stdout` logs of the running scraper. If the Chromium engine deadlocks or hangs (which is inevitable in 5-day long runs), the bot detects 3 minutes of silence, gracefully assassinates the frozen process, and instantly respawns a fresh scraper that resumes exactly where it left off.

### 2. The Deep Scraper (`scraper.py`)
The primary extraction engine. It crawls a business's Google Maps profile and their official website.
* **Dual-Pass Review Extraction:** Captures both "Most Relevant" and "Lowest Rating" reviews to ensure diverse context.
* **Smart Data Extraction:** Uses dynamic fallback logic to extract Timings, Distributed Review Charts, and nested contact info regardless of Google's A/B tested layouts.
* **AI Outreach Hook:** Feeds the extracted reviews into an LLM to generate a customized, persuasive sales pitch tailored to the business's specific pain points or praises.

### 3. The High-Speed Scraper (`scraper_no_website.py`)
A stripped-down, ultra-fast variant of the engine. It skips deep review extraction and AI hook generation entirely. Use this when you only need to rapidly build a massive list of businesses to manually audit later.

---

## 🚀 Setup & Configuration

### Environment Variables (`.env`)
You must create a `.env` file in the root directory with the following 6 keys:
```env
TELEGRAM_BOT_TOKEN="your_telegram_bot_token"
GEMINI_REVIEWS_API_KEY="your_gemini_key_1"
GEMINI_REVIEWS_CLEANER_KEY="your_gemini_key_2"
OPENROUTER_API_KEY="your_openrouter_key_1"
OPENROUTER_API_KEY_AGENT_SMITH="your_openrouter_key_2"
OPENROUTER_API_KEY_CLEANER="your_openrouter_key_3"
```

### Global Settings (`config/settings.json`)
All hardcoded limits and timeouts are stored here for easy tuning:
- `max_review_scrolls`: How deep to scroll the reviews feed (default 50).
- `llm_api_timeout_seconds`: Timeout for Gemini/OpenRouter calls.
- `gspread_max_retries`: How many times to attempt saving to Google Sheets before giving up.

---

## 📱 Telegram Command Reference

You can control the entire operation directly from the Telegram app:

### Core Commands
- `/scrape [arguments]` - Launches a new scraper instance. (e.g., `/scrape --query "plumbers" --locality "in USA" --city "Chicago" --target 1500`)
  - `--no_agent_smith` : Disables Agent Smith, preventing the bot from autonomously generating a new search query and restarting when the current job finishes.
  - `--no_website` : Runs the high-speed scraper variant.
  - `--chunk_size N` : Clears the RAM cache every N leads.
  - `--end_date YYYY-MM-DD` : Automatically stops the scraper on a scheduled date.
- `/stop` - Safely halts the current scraping job, ensures the Excel file is compiled, and shuts down the browser.

### Status & Debugging
- `/status` - View the live heartbeat, current memory usage, and execution metrics of the active scraper.
- `/logs` - Fetches the last 50 lines of the scraper's live terminal output directly to your chat.
- `/ping` - A quick health check to verify if the bot is alive, and whether a scraper is Active, Idle, or Paused.

### State Control (Safe Pausing)
- `/pause` - Safely pauses the scraper without killing the Chromium instance. The Python loop simply sleeps.
- `/pause [minutes]` - Pauses the scraper for a specific duration (e.g., `/pause 30`) before automatically resuming. Perfect for cooling down memory or networks.
- `/resume` - Wakes the scraper up from a paused state.

---

## 🛡️ Self-Healing & Resilience Mechanics

This codebase was specifically engineered to run unattended for weeks at a time without failing.

1. **Watchdog Auto-Recovery:** As mentioned above, deadlocked Playwright instances are automatically terminated and restarted.
2. **Duplicate Resumption:** The script maintains a local `scraped_places.txt` database. If the script restarts (due to a crash or watchdog kill), it references this file to skip all previously completed leads in seconds, resuming exactly where it crashed.
3. **LLM Fallback Cascade:** If Gemini throws a `429 Too Many Requests` error, the script automatically catches the exception and falls back to a massive pool of open-source models via OpenRouter to ensure data processing never halts.
4. **Decoupled API Logic:** If the scraper experiences a minor UI timeout while trying to extract reviews (e.g., a button vanished), it doesn't crash the script. It gracefully recovers, warns the log, and passes whatever partial data it successfully collected to the LLM to guarantee an outreach hook is still generated.

---

## 📁 Output Data

Data is saved simultaneously to two locations to prevent data loss:
1. **Google Sheets:** Row-by-row live updates via `gspread`.
2. **Local Excel File:** A `google_maps_leads.xlsx` file is safely compiled and saved locally when the script finishes or is safely stopped.

The output contains standard CRM fields (Name, Phone, Website, Email, Socials) alongside our proprietary fields (`AI Outreach Hook`, `Timings`, `Distributed Reviews`).
