import asyncio
import pandas as pd
from playwright.async_api import async_playwright
import gspread

SPREADSHEET_NAME = "Google Maps Leads"
WORKSHEET_NAME = "Sheet1"
SERVICE_ACCOUNT_FILE = "service_account.json"

async def fix_websites():
    print("\n=======================================================")
    print("[INIT] INITIALIZING LOCAL-SESSION WEBSITE FIXER")
    print("=======================================================\n")
    
    print("[INFO] Loading current session leads from local Excel...")
    try:
        df = pd.read_excel('google_maps_leads.xlsx')
    except Exception as e:
        print(f"[ERROR] Failed to load local Excel file: {e}")
        return
        
    missing_indices = df[df['Website URL'].isna() | (df['Website URL'] == '') | (df['Website URL'].astype(str).str.strip() == '')].index
    total_missing = len(missing_indices)
    
    if total_missing == 0:
        print("[SUCCESS] No missing websites found in the current session!")
        return
        
    print(f"[INFO] Found {total_missing} leads with missing websites. Booting Playwright...\n")
    
    fixed_count = 0
    rescued_websites = {} # Map Client ID -> Website
    
    # 1. Rescue missing websites
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        for count, idx in enumerate(missing_indices, 1):
            row = df.loc[idx]
            client_id = str(row['Client ID'])
            name = str(row['Business Name']).encode('ascii', 'replace').decode('ascii')
            url = row['Maps URL']
            
            print(f"[{count}/{total_missing}] Analyzing: {name} (ID: {client_id})")
            
            if pd.isna(url) or not str(url).startswith("http"):
                print("  [SKIP] No valid Maps URL found. Skipping.")
                continue
                
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=25000)
                await page.wait_for_timeout(6000) # Give React UI time to render
                
                website = ""
                # MAXIMUM SECURITY WEBSITE EXTRACTION: 3-loop polling over ~4.5 seconds to bypass React hydration
                for _ in range(3):
                    try:
                        # Trick 1: Playwright Native Wait
                        try:
                            w_elem = await page.wait_for_selector('a[data-item-id="authority"], a[data-item-id*="action:"], a[data-item-id*="menu"]', timeout=1500)
                            if w_elem:
                                href = await w_elem.get_attribute('href')
                                if href and "google.com" not in href:
                                    website = href
                                    break
                        except Exception:
                            pass
                            
                        # Trick 2: Javascript DOM Extraction
                        if not website:
                            website = await page.evaluate('''() => {
                                let anchors = Array.from(document.querySelectorAll("a"));
                                let exact = anchors.find(a => a.getAttribute("data-item-id") === "authority");
                                if (exact && exact.href && !exact.href.includes("google.com")) return exact.href;
                                let fuzzy = anchors.find(a => {
                                    let aria = a.getAttribute("aria-label") || "";
                                    let did = a.getAttribute("data-item-id") || "";
                                    return (aria.toLowerCase().includes("website") || did.includes("authority")) && a.href && !a.href.includes("google.com");
                                });
                                if (fuzzy) return fuzzy.href;
                                let fallback = anchors.find(a => {
                                    let did = a.getAttribute("data-item-id") || "";
                                    return (did.includes("menu") || did.includes("action:")) && a.href && !a.href.includes("google.com");
                                });
                                if (fallback) return fallback.href;
                                return "";
                            }''')
                            if website: break
                            
                        # Trick 3: Brute Force Text Regex Locator
                        if not website:
                            try:
                                w_text = await page.query_selector('a:has-text("Website"), a:has-text("website.com"), a[href^="http"]:not([href*="google.com"])')
                                if w_text:
                                    href = await w_text.get_attribute('href')
                                    if href and "google.com" not in href:
                                        website = href
                                        break
                            except Exception:
                                pass
                        
                    except Exception:
                        pass
                    
                    await page.wait_for_timeout(1000)
                            
                if website:
                    print(f"  [SUCCESS] Website Rescued: {website}")
                    df.at[idx, 'Website URL'] = website
                    rescued_websites[client_id] = website
                    fixed_count += 1
                else:
                    print("  [SKIP] No website listed for this business on Google Maps.")
                    
            except Exception as e:
                print(f"  [ERROR] Playwright error: {str(e)[:100]}...")
                
        await browser.close()
        
    print(f"\n=======================================================")
    print(f"[DONE] OPERATION COMPLETE! Rescued {fixed_count} websites.")
    print("=======================================================")
    
    # 2. Sync to Google Sheets explicitly safely
    if rescued_websites:
        print("[INFO] Connecting to Google Sheets to locate these specific rows...")
        try:
            gc = gspread.service_account(filename=SERVICE_ACCOUNT_FILE)
            sh = gc.open(SPREADSHEET_NAME)
            gs_worksheet = sh.worksheet(WORKSHEET_NAME)
            
            # Fetch minimal data just to map Client IDs to Row Numbers
            gs_data = gs_worksheet.get_all_values()
            headers = gs_data[0]
            
            try:
                client_id_col = headers.index("Client ID")
            except ValueError:
                print("[ERROR] 'Client ID' column not found in Google Sheets!")
                return
                
            updates = []
            
            # Find the row numbers for the rescued client IDs
            for row_idx, row in enumerate(gs_data):
                if row_idx == 0: continue # Skip headers
                if len(row) > client_id_col:
                    gs_client_id = str(row[client_id_col]).strip()
                    if gs_client_id in rescued_websites:
                        # GSpread rows are 1-indexed. row_idx is 0-indexed, so add 1.
                        actual_sheet_row = row_idx + 1
                        website = rescued_websites[gs_client_id]
                        updates.append({
                            'range': f'G{actual_sheet_row}',
                            'values': [[website]]
                        })
                        
            if updates:
                print(f"[INFO] Pushing safe batch update to modify ONLY {len(updates)} specific cells...")
                gs_worksheet.batch_update(updates, value_input_option="USER_ENTERED")
                print("[SUCCESS] Live Google Sheets successfully patched without touching any other data!")
            else:
                print("[WARN] Rescued websites were not found in Google Sheets! Are you sure they synced during the scrape?")
                
        except Exception as e:
            print(f"[ERROR] Failed to patch Google Sheets: {e}")
            
    # Save Local Excel
    df.to_excel('google_maps_leads.xlsx', index=False)
    print("[SUCCESS] Local Excel file overwritten with the rescued session data.")

if __name__ == "__main__":
    asyncio.run(fix_websites())
