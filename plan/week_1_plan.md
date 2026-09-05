# 🚀 1-Week Client Acquisition Blueprint: First 10 Paying SMB Clients

> **Agency:** Arclane Studios  
> **Core Offer:** Live Custom Website Demo Built in Advance + High-Conversion Setup  
> **Target Market:** Indian SMBs (Gyms, Salons/Spas, Dental/Specialty Clinics, Cafes)  
> **Week 1 Revenue Target:** **10 Clients @ ₹7,999 – ₹14,999 = ₹80,000 – ₹1,20,000**

---

## 📑 Table of Contents
1. [Core Strategy: The "Value in Advance" Flywheel](#1-core-strategy-the-value-in-advance-flywheel)
2. [System Architecture & Bot Commands](#2-system-architecture--bot-commands-quick-reference)
3. [Daily Rolling Flywheel Routine](#3-daily-rolling-flywheel-scrape-build-send--close-every-day)
4. [WhatsApp Dispatch & Anti-Ban Safety Protocol](#4-whatsapp-dispatch--safety-protocol)
5. [Phone Call Script & Objection Handling Playbook](#5-human-follow-up-phone-call-script--objection-handling-playbook)
6. [Closing, Pricing Packages & Domain Setup Guide](#6-closing-pricing-packages--custom-domain-setup-guide)
7. [Daily KPI Tracker & Revenue Milestones](#7-key-daily-targets--kpi-tracker)

---

## 1. Core Strategy: The "Value in Advance" Flywheel

Traditional agency cold outreach fails because pitching *"Sir, do you need a website?"* triggers instant friction and skepticism.

Your system converts at 10–15% because of 4 psychological triggers:
1. **Proof of Work Before the Pitch:** The prospect opens a fast, mobile-first live website already displaying their business name, reviews, locality, timings, and direct WhatsApp trial booking.
2. **Curiosity-First WhatsApp Hook:** The message asks for honest feedback, not a sales call.
3. **Rapid 24-Hour Courtesy Check-In:** You call as the founder confirming delivery, not as a cold telemarketer.
4. **Frictionless Close:** *"If you like the design direction, we plug in your custom domain, actual photos, and take it live within 24 hours for a one-time partner launch price."*

---

## 2. System Architecture & Bot Commands Quick Reference

### 🔍 Module A: Google Maps Scraper (`gmaps-scraper-Indian`)
* **Path:** `C:\Users\Ameya Sharma\Downloads\gmaps-scraper-Indian`
* **Run Command:** `python telegram_bot.py`
* **High-Converting Search Queries:**
  * `"Gyms in Pune"`, `"Gyms in Surat"`, `"Gyms in Gurugram"`, `"Gyms in Ahmedabad"`
  * `"Unisex Salons in Pune"`, `"Hair Salons in Chandigarh"`, `"Spas in Jaipur"`
  * `"Dental Clinics in Surat"`, `"Physiotherapy Clinics in Indore"`
* **Qualification Filter:** Rating $\ge$ 4.5★, Reviews $\ge$ 40+, Website: *None / Missing*.

### ⚙️ Module B: BI Analyzer, Website Builder & WhatsApp Dispatcher
* **Path:** `C:\Users\Ameya Sharma\Downloads\business_intelligence_reporting_agent- Indian`
* **Run Command:** `node src/index.js`

| Telegram Command | Action Performed |
| :--- | :--- |
| `/login` | Opens browser window to scan WhatsApp Web QR code once. |
| `/analyse --range [X:Y]` | Full automated pipeline: Scrapes intelligence ➔ generates 14-point audit in `reports/<id>/audit.md` ➔ builds mobile-first website in `generated_sites/<id>/` ➔ deploys to Vercel (clean business slug) ➔ publishes to GitHub ➔ generates WhatsApp hook + call script ➔ updates Google Sheet. |
| `/send [X:Y]` | Prepares and exports `.vcf` contacts card to Telegram. Once imported on phone, tap **[Start Sending]** to automate dispatch with safe randomized rate-limiting. |
| `/build <id>` | Rebuilds or redeploys a specific client website demo. |
| `/pause`, `/resume`, `/stop` | Real-time pipeline execution controls. |

---

## 3. Daily Rolling Flywheel (Scrape, Build, Send & Close Every Day)

```
  ┌───────────────────────┐
  │  09:30 AM - 10:30 AM  │ ──► 🔍 Scrape 35 Fresh Qualified Leads (gmaps-scraper-Indian)
  └───────────────────────┘
  ┌───────────────────────┐
  │  10:30 AM - 12:00 PM  │ ──► ⚙️ Auto-Build Websites & Reports (/analyse --range [X:Y])
  └───────────────────────┘
  ┌───────────────────────┐
  │  12:00 PM - 01:15 PM  │ ──► 📲 Morning WhatsApp Dispatch Wave (15–20 Messages)
  └───────────────────────┘
  ┌───────────────────────┐
  │  04:30 PM - 05:45 PM  │ ──► 📲 Afternoon WhatsApp Dispatch Wave (15–20 Messages)
  └───────────────────────┘
  ┌───────────────────────┐
  │  06:00 PM - 07:30 PM  │ ──► 📞 15–20 Courtesy Follow-Up Calls (Yesterday's Leads) ➔ Close 1–2 Deals
  └───────────────────────┘
```

### 📅 7-Day Execution Timeline

* **Day 1 (Monday):** Scrape 35 (`Gyms in Pune`) ➔ Build & Deploy 35 ➔ Send 35 Demos (`/send [530:564]`).
* **Day 2 (Tuesday):** Scrape & Build 35 (`Gyms in Surat`) ➔ Send 35 Demos ➔ 15 Calls to Monday's leads (**Target: 1 Closed Deal**).
* **Day 3 (Wednesday):** Scrape & Build 35 (`Salons in Gurugram`) ➔ Send 35 Demos ➔ 15 Calls (**Target: 2 Closed Deals**).
* **Day 4 (Thursday):** Scrape & Build 35 (`Dental Clinics in Ahmedabad`) ➔ Send 35 Demos ➔ 15 Calls (**Target: 2 Closed Deals**).
* **Day 5 (Friday):** Scrape & Build 35 (`Gyms in Jaipur / Indore`) ➔ Send 35 Demos ➔ 15 Calls (**Target: 2 Closed Deals**).
* **Day 6 (Saturday):** Scrape & Build 35 (`Spas in Chandigarh`) ➔ Send 35 Demos ➔ 20 Calls to warm leads (**Target: 2 Closed Deals**).
* **Day 7 (Sunday):** Map custom domains in Vercel ➔ Collect 50% balance payments ➔ Trigger referral loops (**Target: 2 Closed Deals | 11 Total**).

---

## 4. WhatsApp Dispatch & Safety Protocol

> [!IMPORTANT]
> To protect your WhatsApp number from bans and ensure 90%+ deliverability:
> 1. **Never send more than 35–40 messages per batch.**
> 2. **Always import the `.vcf` contact card** to your phone before dispatching (the bot creates this automatically).
> 3. Use the direct `https://<business-slug>.vercel.app` link (no URL shorteners).
> 4. Keep 30–90 second randomized delays between messages (automated in `src/whatsapp_sender.js`).
> 5. **Ideal Sending Hours:** 11:00 AM – 1:30 PM and 4:30 PM – 7:00 PM. Never send after 8:30 PM.

---

## 5. Human Follow-Up Phone Call Script & Objection Handling Playbook

### 📞 The 60-Second Courtesy Follow-Up Call Script
*(Call 24–48 hours after sending the WhatsApp demo)*

> **You:** "Hi [Owner Name / Business Team], Ameya here from Arclane Studios. Maine aapke business ([Business Name]) ke liye ek custom live website concept banakar WhatsApp par share kiya tha. Bas ek minute check karna tha ki kya aapko link receive hua aur aapne demo glance kiya?"

#### Case A: Prospect says *"Haan, dekha maine / Link mila tha"*
> **You:** "Great! We tailored it specifically with direct WhatsApp membership booking, mobile-first split timings, aur aapki 4.8★ Google reviews highlight ki hain. Aapko overall design aur concept kaisa laga?"
>
> **Owner:** *"Achha laga / Theek hai... but how does this work / pricing kya hai?"*
>
> **You:** "Actually hum local businesses ke liye complete digital setup provide karte hain. Isme aapka custom `.com` / `.in` domain, hosting setup, direct WhatsApp lead capture, aur Google Maps integration sab include rehta hai. Normal price ₹15,000 hoti hai, but since humne already aapka base concept build kar liya hai, we are offering this for a flat launch partner price of ₹7,999 (one-time). Agar aap comfortable hon, 24 hours me aapki actual photos aur packages add karke live kar sakte hain."

#### Case B: Prospect says *"Nahi dekha / Busy tha"*
> **You:** "No problem at all! Direct live demo aapke WhatsApp par hai. Jab bhi aapko 2 minute milein ek baar glance kariyega—koi commitment nahi hai, just wanted to share the idea. Agar aapko direction pasand aaye to batayein, we can connect."

---

### 🛡️ Objection Handling Playbook

| Objection | Word-for-Word High-Converting Response |
| :--- | :--- |
| **"Humein website ki zaroorat nahi hai, JustDial / Instagram chal raha hai."** | *"Bilkul sahi baat hai sir! Instagram photo dekhne ke liye best hai, but jab koi Google par search karta hai 'Best Gym in [Locality]', to Instagram profile convert nahi hoti. Yeh website direct Google search se WhatsApp par trial bookings convert karne ke liye optimized hai. Aap demo open karke dekhiye, 1-tap WhatsApp button se customer direct aapse chat start karta hai."* |
| **"Price kitna hai? / Budget nahi hai."** | *"Sir agency me aisi custom fast website banwane ka market rate ₹15,000–₹25,000 hota hai. But because hamari team ne aapka design already 90% ready kar diya hai, hum aapse sirf ₹7,999 one-time charge kar rahe hain. Isme domain, lifetime hosting setup, WhatsApp buttons, aur Google Business integration sab included hai. Zero monthly recurring maintenance fees."* |
| **"Details WhatsApp par bhej dijiye."** | *"Main turant WhatsApp par summary bhej deta hoon sir. Aap ek baar demo dekhkar bataiye, agar colors ya text me kuch change chahiye to hum customize kar denge."* |
| **"Maintain kaun karega / Changes kaun karega?"** | *"Agar future me timings, prices ya photos change karni hon, aap bas mujhe WhatsApp par photo bhej dijiye, hamari team update kar degi. First year complete support is included."* |

---

## 6. Closing, Pricing Packages & Custom Domain Setup Guide

### 📦 Package Tiers

* **Package 1: Standard Starter (₹7,999 One-Time)**
  * 1-Page High-Converting Mobile-First Website
  * 1 Custom Domain (`.in` or `.com` for 1 year)
  * High-Speed Vercel Global Hosting Setup
  * WhatsApp 1-Tap Trial Booking & Lead Capture
  * Google Reviews & Split Timings Integration
  * Interactive Google Maps & Directions Embed
  * Basic Local SEO (Schema.org + OpenGraph)
* **Package 2: Pro Growth (₹12,999 One-Time)**
  * Everything in Standard Starter PLUS:
  * Full Photo Gallery (up to 25 HD photos)
  * Multi-Service Pricing Table / Rate Card
  * Google Search Console & Google Analytics 4 Setup
  * Priority 24/7 WhatsApp Maintenance Support for 1 Year

---

### 🌐 5-Minute Custom Domain Setup in Vercel

1. In Vercel Project Settings ➔ **Domains** ➔ Add: `clientdomain.com`
2. Log in to client's GoDaddy / Hostinger account:
   * **A Record:** Host `@` ➔ Points to `76.76.21.21`
   * **CNAME Record:** Host `www` ➔ Points to `cname.vercel-dns.com`
3. SSL certificate activates automatically within 3 minutes.

---

## 7. Key Daily Targets & KPI Tracker

| Metric | Mon | Tue | Wed | Thu | Fri | Sat | Sun | Total Week 1 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Leads Scraped** | 35 | 35 | 35 | 35 | 35 | 35 | 20 | **230** |
| **Demos Built & Deployed** | 35 | 35 | 35 | 35 | 35 | 35 | 20 | **230** |
| **WhatsApp Messages Sent** | 35 | 35 | 35 | 35 | 35 | 35 | 0 | **210** |
| **Follow-Up Calls Made** | 0 | 15 | 15 | 15 | 15 | 20 | 10 | **90** |
| **Deals Closed (50% Advance)** | 0 | 1 | 2 | 2 | 2 | 2 | 2 | **11 Clients** |
| **Daily Revenue Booked (₹)** | ₹0 | ₹8k | ₹16k | ₹16k | ₹16k | ₹16k | ₹16k | **₹88,000+** |
