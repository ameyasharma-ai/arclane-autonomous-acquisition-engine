# 🤖 CRM Outreach Automation & Dispatch System

An end-to-end Dual-Bot architecture that leverages a Node.js web-scraping orchestrator to build high-conversion CRM outreach reports, and a stateless Python Telegram bot to parse, preview, and dynamically dispatch beautifully formatted HTML emails with attached SEO audits.

---

## ⚡ Features

### 1. The Analyzer Bot (Node.js)
*   **Deep Web Scraping:** Crawls not just the homepage, but dynamically hunts for `/about`, `/contact`, and `/blog` pages.
*   **Anti-Bot Bypass:** Leverages local Google Chrome (`channel: 'chrome'`) to bypass DNS/Firewall blocks.
*   **Intelligent Budgeting & LLM:** Compresses scraped HTML to fit strict 120k token limits, then uses LLMs to generate high-conversion SPIN sales frameworks.
*   **Google Sheets Sync:** Automatically pulls leads, reads prior AI summaries, and updates the `Notes` column so leads are never processed twice.

### 2. The Sales Dispatch Bot (Python)
*   **Stateless Telegram UI:** Uses Telegram Inline Keyboards to present clickable buttons for all generated leads.
*   **Anti-Duplication Engine:** Automatically syncs with Google Sheets to hide leads that have already been emailed.
*   **Multi-Email Support:** If a business has multiple emails, the bot generates dynamic buttons to let you email them individually or blast them all.
*   **Premium HTML Emails & Audits:** Converts plain text into beautifully formatted HTML emails with hidden markdown links. It also automatically parses the LLM's raw text audit, wraps it in a gorgeous CSS stylesheet, and attaches it as `Website_UX_SEO_Audit.html`.

---

## 🛠️ Prerequisites
- [Node.js](https://nodejs.org/en/) (v18+ recommended)
- [Python 3.10+](https://www.python.org/)
- Google Chrome installed on the host machine.
- 2 Telegram Bot Tokens (from BotFather) - one for the scraper, one for the sales UI.
- A Google Service Account JSON file.
- An OpenRouter API Key.

---

## 🚀 Installation & Setup

1. **Install Node.js Dependencies:**
   ```bash
   npm install
   ```

2. **Install Python Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables:**
   Copy the example environment file and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

4. **Google Sheets Authentication:**
   Place your Google Service Account credentials file in the root directory and name it exactly `service_account.json`. Ensure this service account email is invited as an Editor to your Google Sheet.

---

## 🎮 Execution

To run the system, you must run both bots in parallel (in separate terminal windows or a process manager like PM2).

### Terminal 1 (The Scraper)
```bash
node src/index.js
```
*Send `/analyse` to this bot in Telegram to start generating `.txt` reports in the `reports/` folder.*

### Terminal 2 (The Sales Dispatcher)
```bash
python sales_bot.py
```
*Send `/scan` to this bot in Telegram to view the clickable UI, preview the drafts, and instantly dispatch the HTML emails and premium audits.*
