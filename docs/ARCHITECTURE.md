# SYSTEM ARCHITECTURE & UPGRADE SPECIFICATION: ARCLANE ENGINE

**Document Version:** 2.0.0  
**Date:** September 2026  
**Target:** Autonomous Outbound Sales OS (India Commercial SMBs)  
**Security Level:** Production-Grade / Zero Secrets Exposure  

---

## 1. Executive Summary & Current System Inspection

The Arclane Autonomous Acquisition Engine is an end-to-end sales prospecting, business audit generation, demo website synthesis, Vercel cloud deployment, and automated WhatsApp/email outreach platform targeting Indian local businesses.

### Current State Inspection
1. **Entry Points & Active Services:**
   - `controller_bot/index.js`: Telegram bot controller & Web UI command listener running Telegraf with Socket.io real-time broadcast.
   - `src/web_ui.js`: Express & Socket.io server (port 3000) serving local dashboard (`public/`) and bi-directionally syncing messages with Telegram.
   - `controller_bot/scheduler.js`: Cron-based task scheduler (`node-cron`) configured for 06:00 AM scraping, 07:30 AM audit sweep, 12:00 PM wave 1 dispatch, 4:30 PM wave 2 dispatch, and 6:00 PM phone follow-ups.
   - `scraper/telegram_bot.py`: Python Playwright scraper extracting Google Maps business details, reviews, and phone numbers.
   - `scripts/sales_bot.py`: Python SMTP/Telegram email dispatcher reading `reports/` and sending PDF audit attachments.
   - `scripts/whatsapp_bot.js`: Standalone WhatsApp Web CLI dispatcher using Playwright persistent browser context (`whatsapp_user_session/`).

2. **Current Pipeline & Flow:**
   ```
   Target Input (City/Niche) 
        ↓
   Playwright Google Maps Scraper (Python / Node)
        ↓
   Google Sheets CRM ('Sheet1' via config/service_account.json)
        ↓
   Orchestrator / ScraperRunner: Website & Social Media Scraper
        ↓
   Summarizer (Gemini Flash Lite / OpenRouter GPT-OSS-120B)
        ↓
   14-Point Strategy Audit (audit.md) + Outreach Hooks
        ↓
   WebsiteBuilder: AI-generated single-page landing site (generated_sites/<id>/index.html)
        ↓
   Vercel CLI Deployment (npx vercel --prod)
        ↓
   WhatsAppSender (Playwright headless WhatsApp Web)
        ↓
   CRM Status Update (Google Sheets)
   ```

3. **Existing Integrations & Dependencies:**
   - **AI/LLM:** Google Gemini (`gemini-flash-lite-latest` via Google generative language OpenAI-compatible API) with resilient fallback to top verified OpenRouter `:free` models (`nvidia/nemotron-3-ultra-550b-a55b:free`, `particle-ai/particle-1:free`, `baidu/ernie-5.5-flash-preview:free`, `cohere/north-mini-code:free`, etc.).
   - **CRM:** Google Sheets API (`googleapis`, `google-spreadsheet`, `gspread`) with service account credentials (`config/service_account.json`).
   - **Browser Automation:** Playwright Chromium (used for Google Maps scraping, web scraping, and WhatsApp Web automation).
   - **Deployment:** Vercel CLI (`npx -y vercel --prod --yes`).
   - **Outreach Channels:** WhatsApp Web (browser automation), Gmail SMTP (in `scripts/sales_bot.py`).
   - **Real-Time UI:** Express, Socket.io, Tailwind/Vanilla frontend in `public/`.

4. **Identified Known Weaknesses in Current Implementation:**
   - **Missing Pre-Qualification Layer:** Leads scraped from Google Maps are directly fed into expensive LLM analysis and website generation without checking commercial viability, review thresholds, or domain quality first.
   - **No Deterministic Deduplication Layer:** Leads are deduplicated only by checking whether Google Sheets 'Notes' is populated or by simple Client ID checks. No canonical hash based on normalized phone (E.164), domain, or maps URI exists.
   - **No Dedicated QA / Pre-Flight Verification:** Websites are generated and pushed directly to Vercel without HTML/DOM linting, link checking, or mobile viewport validation.
   - **Lack of Strict Human Approval Gate:** First-contact messages can be dispatched without explicit human sign-off if auto-dispatch is enabled.
   - **No Reply Classification & Follow-Up State Machine:** When a prospect replies, there is no automated reply parser (Interested, Pricing, Opt-Out, Wrong Number) to stop follow-up sequences or flag human handoff.
   - **No Global Emergency Kill Switch:** While `/pause_auto` pauses future cron triggers, there is no hardware-level `EMERGENCY_STOP=true` flag that halts all outbound communication immediately.
   - **No Dry-Run Mode:** Testing previously risked triggering real Vercel deployments or WhatsApp dispatches.
   - **No Docker Containerization:** Host-dependent Windows paths and manual Node/Python environments.

---

## 2. Target Production Architecture

The system is upgraded into a modular, resilient **28-Stage Sales Automation Engine** structured into cleanly isolated layers:

```
[ CAMPAIGN SPEC (JSON) ]
          │
          ▼
┌──────────────────────────────────────────────────────────┐
│ STAGE 1: LEAD DISCOVERY (Google Maps Scraper)            │
└─────────────────────────┬────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────┐
│ STAGE 2: DEDUPLICATION ENGINE                            │
│  - Normalized E.164 Phone                                │
│  - Canonical Domain & Google Place URL                   │
│  - Suppression List & Cooldown Check (90 Days)           │
│  - Outcomes: NEW | DUPLICATE | ALREADY_CONTACTED |       │
│              ALREADY_CLIENT | SUPPRESSED                 │
└─────────────────────────┬────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────┐
│ STAGE 3: LEAD QUALIFICATION                              │
│  - Reviews count & rating analysis                       │
│  - Website existence, tech stack, and mobile audit       │
│  - Output: qualification_score (0-100) & reason          │
└─────────────────────────┬────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────┐
│ STAGE 4: LEAD SCORING & FILTERING                        │
│  - Weighted multi-factor score: Commercial + Fit + Opp   │
│  - Threshold check against campaign minimum_lead_score   │
└─────────────────────────┬────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────┐
│ STAGE 5: GROUNDED RESEARCH                               │
│  - Grounded facts only (No hallucinations/fake claims)   │
│  - Opportunities & personalization points extraction     │
└─────────────────────────┬────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────┐
│ STAGE 6: ISOLATED WORKSPACE WEBSITE GENERATION           │
│  - /workspaces/{lead_id}/ or /generated_sites/{lead_id}/ │
│  - Modern high-contrast mobile-first landing page        │
└─────────────────────────┬────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────┐
│ STAGE 7: AUTOMATED WEBSITE QA GATE                       │
│  - Zero broken links, valid tel/wa CTA links             │
│  - HTML syntax validation & asset accessibility          │
│  - Status: QA_PASSED | QA_FAILED                         │
└─────────────────────────┬────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────┐
│ STAGE 8: VERCEL DEPLOYMENT & HTTP VERIFICATION           │
│  - Isolated project slug deployment                      │
│  - 3x retry with exponential backoff                     │
│  - Live HTTP 200 verification & content match            │
└─────────────────────────┬────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────┐
│ STAGE 9: CONVERSATIONAL MESSAGE GENERATION               │
│  - 3 candidate hooks scored internally                   │
│  - Natural, curiosity-driven copy (Zero sales spam)      │
└─────────────────────────┬────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────┐
│ STAGE 10: HUMAN APPROVAL GATE (Safety Critical)          │
│  - State: MESSAGE_GENERATED -> HUMAN_REVIEW_REQUIRED     │
│  - Options: APPROVE | EDIT | REJECT | SKIP               │
└─────────────────────────┬────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────┐
│ STAGE 11: OUTBOUND OUTREACH (WhatsApp / Email)           │
│  - Rate-limited: max per hour / max per day              │
│  - Respects DRY_RUN and EMERGENCY_STOP flags             │
└─────────────────────────┬────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────┐
│ STAGE 12: UNIFIED CRM & AUDIT LOGGING                    │
│  - Google Sheets + Local JSON state tracking             │
│  - Immutable event log with timestamps & lead ID         │
└─────────────────────────┬────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────┐
│ STAGE 13: REPLY DETECTION & CLASSIFICATION               │
│  - Categories: INTERESTED | QUESTION | PRICING |         │
│                CALL_REQUEST | NOT_INTERESTED | OPT_OUT   │
│  - Immediate follow-up cancellation on any reply         │
└─────────────────────────┬────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────┐
│ STAGE 14: MULTI-STEP FOLLOW-UP STATE MACHINE             │
│  - Schedule: Day +2, Day +4, Day +7                      │
│  - Auto-halts on reply or opt-out                        │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Data Model Specification

Each lead in the upgraded system is managed with normalized fields:

```typescript
interface NormalizedLead {
  lead_id: string; // Unique deterministic ID (e.g., hash of phone/domain)
  business_name: string;
  category: string;
  location: string;
  phone: string; // E.164 format (+91...)
  email: string | null;
  website: string | null;
  google_maps_url: string;
  source: string; // "google_maps" | "manual_entry" | "csv"
  research_data: {
    facts: string[];
    opportunities: string[];
    personalization_points: string[];
    confidence: number;
  };
  qualification_score: number; // 0 - 100
  qualification_reason: string;
  lead_score: number; // 0 - 100
  lead_status: 'NEW' | 'QUALIFIED' | 'DISQUALIFIED' | 'SUPPRESSED';
  contact_status: 'UNCONTACTED' | 'AWAITING_APPROVAL' | 'APPROVED' | 'CONTACTED' | 'OPTED_OUT';
  message_variant: string;
  message_content: string;
  demo_status: 'NOT_BUILT' | 'BUILDING' | 'QA_PASSED' | 'QA_FAILED';
  demo_url: string | null;
  deployment_status: 'PENDING' | 'DEPLOYED' | 'DEPLOYMENT_FAILED';
  deployment_url: string | null;
  outreach_channel: 'whatsapp' | 'email';
  outreach_timestamp: string | null;
  last_contact_timestamp: string | null;
  next_followup_at: string | null;
  followup_count: number;
  reply_status: 'NO_REPLY' | 'REPLIED' | 'HANDOFF_TO_HUMAN';
  reply_classification: string | null;
  meeting_status: 'NOT_SCHEDULED' | 'SCHEDULED' | 'COMPLETED';
  proposal_status: 'NONE' | 'SENT' | 'ACCEPTED' | 'REJECTED';
  client_status: 'PROSPECT' | 'ACTIVE_CLIENT' | 'CHURNED';
  created_at: string;
  updated_at: string;
  error_state: string | null;
}
```

---

## 4. Safety & Security Framework

1. **Global Kill Switch (`EMERGENCY_STOP=true`):**
   - Intercepts all outbound WhatsApp, email, and scheduled cron executions.
   - When enabled, zero external requests are transmitted; system preserves state and transitions into safe inspection mode.
2. **Dry-Run Mode (`DRY_RUN=true`):**
   - Enables full end-to-end testing (lead discovery, scoring, research, local HTML compilation, QA check, message composition).
   - Vercel deployments can run in preview mode or mock mode.
   - Outbound dispatch is fully simulated with structured dry-run logs.
3. **Human Approval Gateway (`HUMAN_APPROVAL_REQUIRED=true`):**
   - Generated outreach messages enter state `HUMAN_REVIEW_REQUIRED`.
   - Dispatch occurs only after explicit human approval via Web UI or Telegram `/approve <lead_id>`.
4. **Rate Limiting & Anti-Spam Guardrails:**
   - Strict batch ceilings (max 20 per wave, max 40 per day).
   - Random jitter delay (30s to 75s) between outbound dispatches.
   - Immediate permanent suppression upon `OPT_OUT` classification.
5. **Secret Redaction & Subprocess Safety:**
   - Credentials (`OPENROUTER_API_KEY`, `API`, `VERCEL_TOKEN`, `GMAIL_APP_PASSWORD`) loaded exclusively via environment variables.
   - Automated logger masks all bearer tokens and private keys before emitting to console or file.
   - All external CLI calls (`npx vercel`) use sanitized arguments with timeouts, preventing command injection.

---

## 5. Migration & Phased Rollout Plan

- **Phase A (Foundation):** Inspection, architecture specification (`ARCHITECTURE.md`), and core models.
- **Phase B (Engine Core):** Normalized data store, deduplication, and lead qualification/scoring engine (`src/engine/`).
- **Phase C (Quality & Deploy Gates):** Automated HTML QA validator, Vercel verification layer, and isolated workspace manager.
- **Phase D (Outreach Safety):** Human approval queue, reply classifier, and follow-up state machine.
- **Phase E (Operations & Containers):** Dockerfile, docker-compose.yml, environment variable validation, and testing suite.
- **Phase F (Documentation):** Complete operational manuals (`SETUP.md`, `DEPLOYMENT.md`, `OPERATIONS.md`, `SECURITY.md`, `API.md`).
