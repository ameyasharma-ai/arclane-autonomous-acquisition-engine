import openpyxl
import os
import glob
import re

# 1. Check Excel file
wb = openpyxl.load_workbook('scraper/google_maps_leads.xlsx')
ws = wb.active
headers = [cell.value for cell in ws[1]]
client_id_idx = headers.index('Client ID')
name_idx = headers.index('Business Name')
website_idx = headers.index('Website URL')
notes_idx = headers.index('Notes')

excel_leads = []
for row in ws.iter_rows(min_row=2, values_only=True):
    site = row[website_idx]
    if site and str(site).strip() and str(site).strip().lower() != 'none':
        excel_leads.append({
            'client_id': row[client_id_idx],
            'name': row[name_idx],
            'website': str(site).strip(),
            'notes': str(row[notes_idx] or '').strip()
        })

print(f"Total leads with website in excel: {len(excel_leads)}")
for r in excel_leads:
    print(f"#{r['client_id']} | {r['name']} | {r['website']} | notes: {r['notes']}")

# 2. Check task logs & scraper logs for any other 'Found valid website'
task_logs = glob.glob('C:/Users/Ameya Sharma/.gemini/antigravity/brain/b12bc7ab-3288-4d35-a3c7-e299473843b7/.system_generated/tasks/*.log')
log_urls = set()
for l in task_logs:
    try:
        with open(l, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                m = re.search(r'Found valid website \(([^)]+)\)', line)
                if m:
                    log_urls.add(m.group(1).strip())
                m2 = re.search(r'\[Google Maps\] \| Website\s*\|\s*(https?://[^\s]+)', line)
                if m2:
                    log_urls.add(m2.group(1).strip())
    except Exception:
        pass

print(f"\nTotal unique valid websites logged during active scraper runs: {len(log_urls)}")
for u in sorted(log_urls):
    print("Scraper logged:", u)

