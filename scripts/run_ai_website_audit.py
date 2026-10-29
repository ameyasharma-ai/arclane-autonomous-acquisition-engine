import os
import re
import urllib.parse
import json
import urllib.request
from dotenv import load_dotenv

load_dotenv('scraper/.env')
GEMINI_KEY = os.getenv('GEMINI_REVIEWS_API_KEY') or os.getenv('GEMINI_API_KEY')

urls_to_test = [
    ("http://gym.com/", "gym.com"),
    ("http://theprofitnessgym.com/", "theprofitnessgym.com"),
    ("https://www.marxfitness.info/", "marxfitness.info"),
    ("https://goldsgym.in/", "goldsgym.in"),
    ("https://form.svhrt.com/6762e8562505a317f8f1e779", "form.svhrt.com"),
    ("https://www.globalfitness.co.in/", "globalfitness.co.in"),
    ("http://www.relaxyogacentre.com/", "relaxyogacentre.com"),
    ("http://www.nispa.in/", "nispa.in"),
    ("https://mmaarenapatna.com/", "mmaarenapatna.com"),
    ("http://familyfitness.in/", "familyfitness.in"),
    ("http://fitnessasylum.in/", "fitnessasylum.in"),
    ("http://www.anantarogyam.in/", "anantarogyam.in"),
    ("http://www.sweatbox.co.in/", "sweatbox.co.in"),
    ("https://hulkfitnesspatna.com/", "hulkfitnesspatna.com"),
    ("https://www.risingyouthgymnastics.com/", "risingyouthgymnastics.com"),
    ("http://proteinworld.in/", "proteinworld.in")
]

prompt = """You are an elite website and lead evaluation AI for Arclane Studios (a web dev agency).
We hunt for local businesses with NO professional website, or whose URL is merely an experimental build, temporary placeholder, generic template, free builder subdomain (netlify, vercel, github.io, replit, grexa, etc.), form link (forms.gle, svhrt, waitlist), aggregator profile (cult.fit, justdial), or parked domain where the business still needs our custom high-converting website build.

Analyze each of the following URLs and determine if each is a 'website_of_interest' (TRUE: candidate for us to build a website for) or 'legitimate_custom_website' (FALSE: established dedicated commercial website).

URLs:
""" + "\n".join([f"- {dom}: {url}" for url, dom in urls_to_test]) + """

Reply strictly in JSON with this format:
{
  "results": [
    {
      "domain": "example.com",
      "url": "http://example.com",
      "is_website_of_interest": true,
      "reason": "1 sentence explanation"
    }
  ]
}
"""

api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key={GEMINI_KEY}"
payload = {
    "contents": [{"parts": [{"text": prompt}]}],
    "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"}
}
req = urllib.request.Request(api_url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.loads(res.read().decode('utf-8'))
        text = data['candidates'][0]['content']['parts'][0]['text']
        parsed = json.loads(text)
        print("AI Batch Output:")
        print(json.dumps(parsed, indent=2))
        with open('scraper/ai_website_audit_results.json', 'w') as f:
            json.dump(parsed, f, indent=2)
except Exception as e:
    print("Error:", e)
