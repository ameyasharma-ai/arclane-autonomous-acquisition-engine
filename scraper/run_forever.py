import subprocess
import time
import sys
import argparse

import json
import os

import builtins
from datetime import datetime


# Hijack the built-in print function to inject timestamps globally
original_print = builtins.print
def timestamped_print(*args, **kwargs):
    timestamp = datetime.now().strftime("[%Y-%m-%d %H:%M:%S]")
    original_print(timestamp, *args, **kwargs)
builtins.print = timestamped_print

# --- LOAD DYNAMIC CONFIGURATION ---
try:
    with open("config/settings.json", "r", encoding="utf-8") as f:
        CONFIG = json.load(f)
except Exception as e:
    print(f"[WARNING] Could not load config/settings.json, using defaults. Error: {e}")
    CONFIG = {"runner": {"default_chunk_size": 50, "default_target_leads": 1500, "crash_cooldown_seconds": 10, "ram_reclaim_sleep_seconds": 3}}

DEFAULT_CHUNK_SIZE = CONFIG["runner"].get("default_chunk_size", 50)
DEFAULT_TARGET_LEADS = CONFIG["runner"].get("default_target_leads", 1500)
CRASH_COOLDOWN = CONFIG["runner"].get("crash_cooldown_seconds", 10)
RAM_SLEEP = CONFIG["runner"].get("ram_reclaim_sleep_seconds", 3)


def main():
    parser = argparse.ArgumentParser(description="24/7 Memory Safe Runner for Google Maps Scraper")
    parser.add_argument("--query", type=str, default="restaurants", help="Search query (e.g., 'restaurants')")
    parser.add_argument("--locality", type=str, default="in USA", help="Locality/Area (e.g., 'in USA')")
    parser.add_argument("--city", type=str, default="Los Angeles", help="City or specific location")
    parser.add_argument("--target", type=int, default=DEFAULT_TARGET_LEADS, help="Total target leads")
    parser.add_argument("--chunk_size", type=int, default=DEFAULT_CHUNK_SIZE, help="Number of leads before flushing memory")
    parser.add_argument("--end_date", type=str, default="", help="Optional end date (YYYY-MM-DD)")
    parser.add_argument("--end_time", type=str, default="", help="Optional end time (HH:MM) 24h format")
    parser.add_argument("--no_website", action="store_true", help="Launch specialised hunter for leads with no website")
    
    args = parser.parse_args()
    
    import datetime
    deadline = None
    if args.end_date and args.end_time:
        try:
            deadline = datetime.datetime.strptime(f"{args.end_date} {args.end_time}", "%Y-%m-%d %H:%M")
        except ValueError:
            print("Invalid date/time format. Use YYYY-MM-DD and HH:MM")
    
    import os
    if os.path.exists("stop_scraper.flag"):
        os.remove("stop_scraper.flag")
        
    # User request: local Excel should only contain the current session data.
    # We delete it at the start of the master session. It will be built up via chunks.
    if os.path.exists("google_maps_leads.xlsx"):
        try:
            os.remove("google_maps_leads.xlsx")
            print("[INFO] Cleared previous session's local Excel file. Starting fresh for this session.")
        except Exception as e:
            print(f"[WARNING] Could not clear local Excel file: {e}")
        
    leads_extracted = 0
    while leads_extracted < args.target:
        import os
        if os.path.exists("stop_scraper.flag"):
            print("\n[SHUTDOWN] Stop flag detected! Terminating memory loop cleanly.")
            break
            
        if os.path.exists("target_update.txt"):
            try:
                with open("target_update.txt", "r") as f:
                    args.target = int(f.read().strip())
            except Exception:
                pass
            
        if deadline and datetime.datetime.now() > deadline:
            print(f"\n[SHUTDOWN] Deadline reached ({deadline}). Terminating memory loop cleanly.")
            # Create the stop flag so telegram bot knows it finished gracefully or just break
            break
            
        # Re-check condition if target was dynamically updated
        if leads_extracted >= args.target:
            print(f"\n[HOT SWAP] Dynamic target ({args.target}) reached! Terminating memory loop cleanly.")
            break
            
        chunk = min(args.chunk_size, args.target - leads_extracted)
        print(f"\n[MEMORY SAFE RUNNER] Launching Chromium (Targeting {chunk} new leads. Total extracted so far: {leads_extracted}/{args.target})")
        
        try:
            # Check length of excel before run
            initial_leads = 0
            if os.path.exists("google_maps_leads.xlsx"):
                try:
                    import pandas as pd
                    initial_leads = len(pd.read_excel("google_maps_leads.xlsx"))
                except Exception:
                    pass

            # We pass the chunk size to the scraper. The scraper will skip duplicates and extract exactly this many new leads.
            script_to_run = "scraper_no_website.py" if getattr(args, "no_website", False) else "scraper.py"
            cmd = [
                sys.executable, "-u", script_to_run, 
                "--query", args.query, 
                "--locality", args.locality, 
                "--city", args.city, 
                "--leads", str(chunk)
            ]
            if args.end_date:
                cmd.extend(["--end_date", args.end_date])
            if args.end_time:
                cmd.extend(["--end_time", args.end_time])
            
            result = subprocess.run(cmd, check=True)
            
            # Check length of excel after run to see how many were actually extracted
            final_leads = initial_leads
            if os.path.exists("google_maps_leads.xlsx"):
                try:
                    import pandas as pd
                    final_leads = len(pd.read_excel("google_maps_leads.xlsx"))
                except Exception:
                    pass
                    
            actual_extracted = max(0, final_leads - initial_leads)
            leads_extracted += actual_extracted
            
            print(f"\n[MEMORY FLUSH] Successfully extracted {actual_extracted} new leads. Flushing RAM caches and restarting browser...")
            
            if actual_extracted == 0:
                print("\n[WARNING] No new leads were found in this pass. Google Maps may have exhausted results for this query. Terminating loop to prevent infinite retry.")
                break
                
            time.sleep(RAM_SLEEP) # Give OS time to reclaim RAM
            
            
        except subprocess.CalledProcessError as e:
            print(f"\n[CRASH DETECTED] Scraper process crashed with error code {e.returncode}. Auto-restarting in 10 seconds to resume from last saved lead...")
            time.sleep(CRASH_COOLDOWN)
            
if __name__ == "__main__":
    main()
