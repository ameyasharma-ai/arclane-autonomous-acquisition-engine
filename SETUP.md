# SETUP GUIDE: ARCLANE AUTONOMOUS SALES ENGINE

## 1. Prerequisites
- **Node.js**: v20.x or v22.x LTS
- **Python**: 3.10+ (with `pip`)
- **Docker & Docker Compose**: (Optional, for containerized deployment)
- **Vercel CLI**: Installed globally or via `npx`
- **Google Cloud Service Account**: With Google Sheets API and Google Drive API enabled.

---

## 2. Environment Variables Configuration

Copy `.env.example` to `.env` and populate your secrets:

```bash
cp .env.example .env
```

Required variables:
```ini
# Master Safety Switches (Defaults to safest parameters)
DRY_RUN=true                      # Set to false only for production outreach
HUMAN_APPROVAL_REQUIRED=true      # Keeps first-contact messages in review queue
EMERGENCY_STOP=false              # Global kill switch (set true to halt all sending)

# Telegram Controller & Notifications
CONTROLLER_BOT_TOKEN="your_telegram_bot_token"
TELEGRAM_BOT_TOKEN="your_scraper_bot_token"

# AI Inference (Gemini & OpenRouter)
API="your_gemini_api_key"         # Primary Gemini Flash Lite model
OPENROUTER_API_KEY="your_openrouter_key" # Resilient fallback

# Google Sheets CRM
SPREADSHEET_NAME="ArcLane Outbound CRM"
WORKSHEET_NAME="Sheet1"
SERVICE_ACCOUNT_FILE="service_account.json"

# Deployment
VERCEL_TOKEN="your_vercel_api_token"
```

---

## 3. Local Installation & Verification

1. Install Node.js dependencies:
   ```bash
   npm install
   ```

2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   playwright install chromium
   ```

3. Run the automated production test suite:
   ```bash
   node src/test_production_suite.js
   ```

---

## 4. Running the Engine

### A. Dry-Run Mode (Safe Testing)
```bash
# In .env, ensure DRY_RUN=true
node controller_bot/index.js
```
In dry-run mode, leads are scraped, deduplicated, scored, researched, websites generated locally, and messages queued without sending any real WhatsApp or Email dispatches.

### B. Production Mode (Live Outreach with Human Review)
```bash
# In .env, set DRY_RUN=false, HUMAN_APPROVAL_REQUIRED=true
node controller_bot/index.js
```
Messages will be generated and held in the **Approval Queue** until reviewed via Web UI or Telegram.
