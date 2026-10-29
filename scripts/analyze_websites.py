import re
import urllib.parse
import os

# Read blacklisted_urls.txt
bl_path = os.path.join('scraper', 'blacklisted_urls.txt')
with open(bl_path, 'r', encoding='utf-8') as f:
    existing_lines = [line.strip() for line in f if line.strip()]

existing_entries = {}
for line in existing_lines:
    parts = [p.strip() for p in line.split(',')]
    domain = parts[0].lower().replace('https://', '').replace('http://', '').strip('/')
    tag = parts[1] if len(parts) > 1 else ''
    existing_entries[domain] = tag

print("Current entries count:", len(existing_entries))

# Candidate URLs from scraper and sheets
candidate_urls = [
    # From Excel Leads 1-100+
    "https://visibeen-4-1783491169301.netlify.app/",
    "https://sii-bello-beauty-salon.grexa.site/",
    "https://falconspa.netlify.app/",
    "https://style-vibes-unisex-salon.grexa.site/",
    "https://cfs-gym.grexa.site/",
    "https://heartbeat-hub-nine.vercel.app/",
    "https://populardineout.github.io/",
    "http://fitbeast.netlify.app/",
    "https://fitnessvilla-pro-gym--abhishek9262kum.replit.app/",
    "https://tushar0612.github.io/",
    "https://knockoutfit.netlify.app/",
    "https://hardcore-gym.github.io/",
    "https://lpd.yourdigitallift.in/",
    "https://www.cult.fit/",
    # From Scraper Logs Leads 101-123
    "http://gym.com/",
    "http://theprofitnessgym.com/",
    "https://www.marxfitness.info/",
    "https://goldsgym.in/",
    "https://form.svhrt.com/6762e8562505a317f8f1e779",
    "https://www.globalfitness.co.in/",
    "http://www.relaxyogacentre.com/",
    "http://www.nispa.in/",
    "https://mmaarenapatna.com/",
    "http://familyfitness.in/",
    "http://fitnessasylum.in/",
    "http://www.anantarogyam.in/",
    "http://www.sweatbox.co.in/",
    "https://hulkfitnesspatna.com/"
]

def extract_domain_or_slug(url):
    parsed = urllib.parse.urlparse(url)
    netloc = parsed.netloc.lower()
    if netloc.startswith('www.'):
        netloc = netloc[4:]
    return netloc

# Analysis of experimental / generic vs established commercial portals
# 1. Experimental builders / generic agency / subdomains / form links:
# - netlify.app -> builder
# - vercel.app -> builder
# - github.io -> builder
# - replit.app -> builder
# - grexa.site -> generic micro-site
# - yourdigitallift.in -> gym portal/aggregator
# - svhrt.com / form.svhrt.com -> generic form site
# - marxfitness.info -> single-page template / generic builder
# - gym.com -> placeholder / generic parked domain
#
# Let's inspect the domains
analysis_results = []
for u in candidate_urls:
    dom = extract_domain_or_slug(u)
    # Check if interest
    is_interest = False
    reason = ""
    if any(k in dom for k in ['netlify.app', 'vercel.app', 'github.io', 'replit.app', 'grexa.site', 'yourdigitallift.in', 'svhrt.com', 'cult.fit']):
        is_interest = True
        reason = "Matched generic builder/aggregator platform"
    elif dom in ['marxfitness.info']:
        is_interest = True
        reason = "Generic template / single-page experimental portfolio"
    elif dom in ['gym.com']:
        is_interest = True
        reason = "Generic parked / test URL entered on Maps listing"
    else:
        is_interest = False
        reason = "Custom commercial business portal or custom TLD domain"
    
    analysis_results.append((u, dom, is_interest, reason))

print("Analysis Results:")
for u, dom, is_int, r in analysis_results:
    print(f"{dom:30} | Interest: {str(is_int):5} | {r}")

