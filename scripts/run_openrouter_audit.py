import os
import json
import urllib.request
from dotenv import load_dotenv

load_dotenv('scraper/.env')
k = os.getenv('OPENROUTER_API_KEY') or os.getenv('OPENROUTER_API_KEY_AGENT_SMITH')

prompt = """Analyze these business website domains encountered during Google Maps lead generation.
For each, determine whether it is a 'website_of_interest' (meaning an experimental single-page site, template build, placeholder, form, free builder, or aggregator where the business still needs our custom website) OR a 'custom_commercial_site'.

Domains to evaluate:
1. gym.com
2. theprofitnessgym.com
3. marxfitness.info
4. goldsgym.in
5. form.svhrt.com
6. globalfitness.co.in
7. relaxyogacentre.com
8. nispa.in
9. mmaarenapatna.com
10. familyfitness.in
11. fitnessasylum.in
12. anantarogyam.in
13. sweatbox.co.in
14. hulkfitnesspatna.com
15. risingyouthgymnastics.com
16. proteinworld.in

Respond strictly as JSON list of objects:
[{"domain": "example.com", "is_website_of_interest": true, "reason": "Explanation"}]
"""

headers = {
    'Authorization': f'Bearer {k}',
    'Content-Type': 'application/json'
}
payload = {
    'model': 'google/gemini-2.0-flash-lite-001',
    'messages': [{'role': 'user', 'content': prompt}],
    'temperature': 0.1
}

req = urllib.request.Request('https://openrouter.ai/api/v1/chat/completions', data=json.dumps(payload).encode('utf-8'), headers=headers)
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.loads(r.read().decode('utf-8'))
        content = res['choices'][0]['message']['content'].strip()
        if content.startswith('```json'):
            content = content[7:]
        if content.startswith('```'):
            content = content[3:]
        if content.endswith('```'):
            content = content[:-3]
        parsed = json.loads(content.strip())
        with open('scraper/ai_website_audit_results.json', 'w') as out_f:
            json.dump(parsed, out_f, indent=2)
        print("Success! Evaluated domains:", len(parsed))
except Exception as e:
    print("Error:", e)

