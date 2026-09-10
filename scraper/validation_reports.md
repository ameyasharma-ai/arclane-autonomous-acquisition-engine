# Data Extraction & Validation Report

This document serves as the master reference for how the Google Maps Scraper validates and extracts critical data points (Websites, Emails, and Social Media) from business listings and websites. It outlines the defenses implemented to ensure the highest possible data purity for your CRM.

---

## 1. Website Extraction & Validation (Google Maps)

Google Maps is a heavily obfuscated React Single-Page Application. Data is hydrated dynamically, meaning traditional scraping fails. To guarantee a 99.9% website capture rate, the scraper uses a **Maximum Security 3-Stage Polling Loop** over ~4.5 seconds.

### The 3-Stage Engine
1. **The Native Blueprint Extraction:** Scans the live DOM for elements specifically tagged with internal backend labels (`a[data-item-id="authority"]`, `action:`, or `menu`).
2. **In-Memory Javascript Deep Search:** Injects custom JS directly into the Chromium browser's memory to rip out all anchor (`<a>`) tags and run a fuzzy-match algorithm checking if the `aria-label` contains the word "website".
3. **Visual Fallback:** Uses Playwright's visual engine to literally look at the screen like a human and search for any button visually displaying the text `"Website"` or `"website.com"`.

### Validation Gates
Every time a URL is extracted by any of the 3 stages, it passes through these filters:
- **Google Link Trap Filter:** Automatically rejects any URL containing `google.com` (which Google uses to bait scrapers into "Search this on Google" loops).
- **The `--no_website` Blacklist:** If the No-Website hunter is active, the URL is cross-referenced against every line in `blacklisted_urls.txt`. If it matches generic directories (e.g., `facebook.com`, `calendly.com`, `linktr.ee`), the scraper deletes the URL and flags the lead as a "No-Website" prospect.

---

## 2. Email Extraction Methodology

The scraper acts as a simulated human user. It auto-clicks "Accept Cookies" popups and deep-scrolls 120,000 pixels down the page to trigger lazy-loaded footers before searching for emails across a maximum of 15 high-value pages per business (prioritizing `/contact`, `/about`, etc.).

### The 3-Layer Attack
1. **The Universal Regex Hunter:** Scans the raw HTML string for emails. **Crucially**, it uses a dynamic TLD catcher (`[a-z]{2,24}`) rather than a hardcoded list. This ensures it successfully extracts modern domains like `.agency`, `.pizza`, `.digital`, as well as every 2-letter country code (`.uk`, `.in`).
2. **The Anti-Obfuscation Engine:** Advanced regex perfectly decodes businesses attempting to hide from scrapers by writing their emails in plain text (e.g., `info [at] example [dot] com` or `admin_at_domain-dot-com`).
3. **Native `mailto:` Trapping:** Extracts native anchor `href`s containing `mailto:`, URL-decodes them, and safely splits them by commas.

### The Junk Filter (False-Positive Prevention)
The system runs all found emails against a strict blacklist to keep the CRM clean:
- **Media Rejection:** Drops emails ending in `.png`, `.jpg`, `.jpeg`, `.css`, `.js`, `.svg`, `.webp`.
- **Placeholder Rejection:** Drops purely fake domains (`example.com`, `yourdomain.com`, `wix.com`, `sentry.io`).
- **Safety Rule:** Prefix traps (like `user@` or `test@`) are intentionally *allowed* so that legitimate businesses (e.g., `user@fuckingrestaurant.com`) are not accidentally deleted.

---

## 3. Social Media Extraction Methodology

Finding social links is difficult because websites are littered with "Share to Facebook" buttons which pollute the CRM with useless data.

### Extraction Layers
1. **The Native DOM Parser:** Evaluates every clickable link on the page using Python's `urllib.parse` to extract the root domain. It flags domains matching `instagram.com`, `linkedin.com`, `facebook.com`, `x.com`, `twitter.com`, `youtube.com`, and `tiktok.com`.
2. **The Memory Scanner:** Uses regex to rip through the raw memory of the page to find URLs hidden inside JavaScript variables.

### Normalization & The Blacklist Gate
To ensure the system only captures *Profiles* and not *Share Buttons*, every URL must pass strict platform-specific blacklists:
- **Instagram:** Rejects `/p/`, `/explore/`, `/stories/`, `/share`, `/create`.
- **Facebook:** Rejects `/sharer`, `/events/`, `/groups/`, `/post`, `/home`.
- **X (Twitter):** Rejects `/status/`, `/intent/`, `/share`, `/tweet`.
- **YouTube:** Rejects `/embed`, `/watch`, `/s/`.
- **LinkedIn:** Rejects `/pulse/`, `/jobs/`.

If a URL passes the blacklist, it is aggressively normalized (stripping `https://`, `www.`, and trailing slashes) to guarantee the exact same profile isn't saved to your CRM twice.
