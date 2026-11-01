with open('public/index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if any(k in l for k in ['Autopilot', 'Test Run', 'Quick Actions', 'stream_scrape', 'run_full']):
        print(f"Line {i+1}: {l.strip()[:80].encode('ascii', 'ignore').decode('ascii')}")
