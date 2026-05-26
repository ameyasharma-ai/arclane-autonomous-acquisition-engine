# 🤖 CRM Outreach Automation Enrichment Bot

A high-performance Node.js agent that leverages Playwright and Large Language Models (LLMs) to perform deep business enrichment for CRM outreach. 

It sequentially crawls a business's entire digital footprint (website, sub-pages, social media) while safely bypassing anti-bot measures by utilizing native browser channels. The extracted raw data is heavily compressed, intelligently budgeted to fit within strict LLM token ceilings (~120k tokens), and analyzed to generate high-conversion SPIN sales frameworks.

---

## ⚡ Features
*   **Deep Web Scraping:** Crawls not just the homepage, but dynamically hunts for and extracts text from `/about`, `/services`, `/contact`, and `/blog` pages.
*   **Native Anti-Bot Bypass:** Leverages your local Google Chrome installation (`channel: 'chrome'`) to bypass DNS/Firewall blocks and Cloudflare bot-checks.
*   **Intelligent Content Compression:** Uses Cheerio to surgically strip HTML bloat, SVGs, and scripts to extract dense text.
*   **Token Budgeting:** Dynamically budgets characters (350k for websites, 100k for socials) to ensure the strict 120k token ceiling is never exceeded.
*   **Telegram Command Center:** Fully controllable via Telegram with background processing, allowing you to `/pause`, `/resume`, and `/stop` tasks on the fly.
*   **Google Sheets Sync:** Automatically pulls leads, reads prior AI summaries, and updates the `Notes` column so leads are never processed twice.

---

## 🛠️ Prerequisites
- [Node.js](https://nodejs.org/en/) (v18+ recommended)
- Google Chrome installed on the host machine.
- A Telegram Bot Token (from BotFather).
- A Google Service Account JSON file (with access to your CRM sheet).
- An OpenRouter API Key for the LLM.

---

## 🚀 Installation & Setup

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add your credentials:
   ```env
   TELEGRAM_BOT_TOKEN="your_telegram_bot_token"
   GOOGLE_SHEET_ID="your_google_sheet_id"
   OPENROUTER_API_KEY="your_openrouter_api_key"
   ```

3. **Google Sheets Authentication:**
   Place your Google Service Account credentials file in the root directory and name it exactly `service_account.json`. Ensure this service account email is invited as an Editor to your Google Sheet.

4. **Customize Blacklisted Columns (Optional):**
   Open `src/summarizer.js` and edit the `ignoredColumns` array to prevent duplicate data from being sent to the LLM if your CRM has redundant summary columns.

---

## 🎮 Telegram Commands

Start the bot locally:
```bash
node src/index.js
```

Once running, you can command it from Telegram:

*   **`/analyse`**
    *   *Usage:* Start analyzing all leads that have an empty "Notes" column.
*   **`/analyse --range [1:10]`**
    *   *Usage:* Only analyze leads whose row/client ID is between 1 and 10.
*   **`/analyse --range [1:10] - {3,5}`**
    *   *Usage:* Analyze leads 1 through 10, but specifically skip 3 and 5.
*   **`/pause`**
    *   *Usage:* Pauses the execution gracefully. It will finish processing the *current* lead and then pause before starting the next one.
*   **`/resume`**
    *   *Usage:* Unpauses the execution and immediately begins processing the next lead in the queue.
*   **`/stop`**
    *   *Usage:* Hard stops the execution gracefully. Finishes the current lead and then terminates the batch completely.

---

## 📁 Output Structure

The bot generates detailed Markdown reports locally in the `/reports` directory. 
Each file is named after the Client ID (e.g., `123.txt`). The reports are formatted using the SPIN framework (Situation, Problem, Implication, Need-Payoff) perfectly tailored for CRM email and sequence outreach.
