# Arclane Free Cloud Deployment Architecture Plan

## Executive Overview
This document outlines the architecture, setup procedure, and technical blueprints for deploying the **Arclane Autonomous Acquisition Engine** 100% free of cost on cloud infrastructure, specifically stripping out heavy WhatsApp browser sessions and substituting high-RAM Playwright scrapers with lightweight API endpoints (SerpApi) to run effortlessly inside tight memory limits (e.g., Render Free Tier 512 MB).

---

## 1. High-Level Architecture

```
┌────────────────────────────────────────────────────────┐
│ 1. Free Cloud Compute (Engine + Dashboard API)         │
│    • Render.com Free Web Service (512 MB RAM)          │
│    • OR Oracle Cloud Always-Free Tier (24 GB RAM)      │
│    • Node.js 20+ Runtime (No heavy browser sessions)   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼ Lead Acquisition (Zero-RAM Overhead)
┌────────────────────────────────────────────────────────┐
│ 2. Lead Discovery Layer (SerpApi Free Tier)            │
│    • 250 free monthly searches (~20 leads/request)     │
│    • Yield: Up to 5,000 verified SMB leads / month     │
│    • RAM: ~15 MB (Pure HTTP REST JSON vs 800MB Chrome) │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼ Website Synthesis & Code Generation
┌────────────────────────────────────────────────────────┐
│ 3. Gemini Flash Code Engine (Google AI Studio Free)    │
│    • 15 RPM / 1,500 Requests per Day (Free Tier)       │
│    • Production-grade, zero-vulnerability mobile HTML  │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼ Automatic Subdomain Staging & Hosting
┌────────────────────────────────────────────────────────┐
│ 4. Vercel Hobby Tier + GitHub Actions (100% Free)      │
│    • Dynamic Next.js routing in `web-dev-agency`       │
│    • Live subdomains on `*.vercel.app` (Free SSL/CDN)  │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼ CRM & Audit Persistence
┌────────────────────────────────────────────────────────┐
│ 5. Google Sheets CRM API (Google Cloud Free Tier)      │
│    • Real-time updates: Status, Website URL, Phone     │
└────────────────────────────────────────────────────────┘
```

---

## 2. Why Strip WhatsApp & Playwright for Free Cloud Hosting?

| Component | Default Local Setup | Cloud Free-Tier Adaptation | Impact & Savings |
| :--- | :--- | :--- | :--- |
| **WhatsApp Automation** | Playwright Chromium with persistent session cookies | **Removed / Manual Outbound** | Eliminates phone linking, disconnect risks, and cloud IP account bans. |
| **Lead Scraping** | Local headless Playwright scrolling Maps | **SerpApi Google Maps REST API** | Slashes RAM from **~900 MB** down to **~15 MB**, preventing Render OOM crashes. |
| **Compute Cost** | Runs on local developer machine | **Render.com / Oracle Cloud Free** | Runs 24/7 in the cloud at **$0.00 / month**. |

---

## 3. SerpApi Free Tier Math & Capacity

* **Monthly Credit**: 250 searches / month (No credit card required).
* **Throughput**: Max 50 searches / hour.
* **Payload per Search**: 1 Google Maps search returns **~20 local businesses** with:
  * Business Name & Category
  * Phone Number (Verified)
  * Full Address & Locality
  * Google Star Rating & Review Count
  * Google Maps URL & Photos
* **Lead Potential**:
  * $1 \text{ search} = 20 \text{ leads}$
  * $250 \text{ searches} = \mathbf{5,000 \text{ leads/month}}$
  * **Daily Run Rate**: 1 to 2 daily queries ($20 - 40 \text{ leads/day}$) operates well within the 250 monthly cap.

---

## 4. Cloud Implementation Blueprint

### Step A: SerpApi Scraper Adapter (`src/serpapi_scraper.js`)
Instead of launching Chromium, fetch structured JSON via standard HTTP:

```javascript
import fetch from 'node-fetch';

export async function fetchGoogleMapsLeadsSerpApi(query, apiKey) {
    const url = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(query)}&api_key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.local_results) return [];

    return data.local_results.map((place, idx) => ({
        clientId: idx + 1,
        businessName: place.title,
        phone: place.phone || '',
        category: place.type || '',
        address: place.address || '',
        rating: place.rating || '',
        reviews: place.reviews || 0,
        mapsUrl: place.link || '',
        website: place.website || ''
    }));
}
```

### Step B: Render.com Free Service Configuration
1. **Build Command**:
   ```bash
   npm install && cd web-dev-agency && npm install && cd ..
   ```
2. **Start Command**:
   ```bash
   node controller_bot/index.js
   ```
3. **Environment Variables**:
   * `API`: Gemini Flash API Key
   * `ANTHROPIC_API_KEY`: Claude API Key
   * `SERPAPI_KEY`: SerpApi Free Key
   * `TELEGRAM_BOT_TOKEN`: Controller Bot Token
   * `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Google Sheets Service Email
   * `GOOGLE_PRIVATE_KEY`: Service Account RSA Key
   * `GOOGLE_SHEET_ID`: Active CRM Sheet ID
   * `GITHUB_TOKEN`: GitHub PAT (with `repo` write access for Vercel staging)
   * `PORT`: `3001`
   * `TZ`: `Asia/Kolkata`

### Step C: Keep-Alive Mechanism (Anti-Sleep)
Render free services sleep after 15 minutes of inactivity. Use a free external ping service (e.g. [cron-job.org](https://cron-job.org) or UptimeRobot) targeting:
```
GET https://your-render-app.onrender.com/api/analytics
```
Interval: Every 10 minutes (ensures the 06:00 AM and 07:30 AM cron schedules trigger without sleeping).

---

## 5. Cost Breakdown Summary

| Layer | Provider | Free Tier Allowance | Effective Cost |
| :--- | :--- | :--- | :--- |
| **Compute** | Render.com | Free Web Service (512 MB) | **$0.00** |
| **Lead Scraping** | SerpApi | 250 Maps Queries (5,000 leads/mo) | **$0.00** |
| **AI Website Builder**| Google Gemini | Gemini Flash (1500 req/day) | **$0.00** |
| **Site Hosting** | Vercel | Unlimited Hobby Deployments | **$0.00** |
| **CRM Database** | Google Sheets | Google Cloud API Free Tier | **$0.00** |
| **Total Monthly Spend** | | | **$0.00 / ₹0** |
