import os
import sys
import asyncio
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

from dotenv import load_dotenv

load_dotenv()
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
# State flags to prevent overlapping executions
is_scraping_running = False
is_fixer_running = False

import aiohttp

import json

# --- LOAD DYNAMIC CONFIGURATION ---
try:
    with open("config/settings.json", "r", encoding="utf-8") as f:
        CONFIG = json.load(f)
except Exception as e:
    print(f"[WARNING] Could not load config/settings.json, using defaults. Error: {e}")
    CONFIG = {"telegram_bot": {"agent_smith_history_limit": 5, "agent_smith_timeout_seconds": 180}}

AGENT_HISTORY_LIMIT = CONFIG["telegram_bot"].get("agent_smith_history_limit", 5)
AGENT_TIMEOUT = CONFIG["telegram_bot"].get("agent_smith_timeout_seconds", 180)

import re
import datetime

async def ask_agent_smith(previous_command, extracted_count):
    agent_key = os.getenv("OPENROUTER_API_KEY_AGENT_SMITH", "")
    if not agent_key:
        return None
        
    try:
        with open("instructions.txt", "r") as f:
            instructions = f.read()
    except:
        instructions = ""
        
    try:
        with open("scraped_places.txt", "r") as f:
            lines = f.readlines()
            # Only keep the last N lines to prevent token bloat
            recent_lines = lines[-AGENT_HISTORY_LIMIT:] if AGENT_HISTORY_LIMIT > 0 else lines
            scraped = "".join(recent_lines)
    except:
        scraped = ""
        
    prompt = f"I was searching via command '{previous_command}' on Google Maps, and got {extracted_count} leads.\n\nAttached are instruction.txt and scraped_places.txt for your context:\n\n--- INSTRUCTIONS ---\n{instructions}\n\n--- SCRAPED PLACES ---\n{scraped}\n\nPlease tell me what businesses and places to scrape next. Return ONLY the exact /scrape command."
    
    headers = {
        "Authorization": f"Bearer {agent_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "openai/gpt-oss-120b:free",
        "messages": [{"role": "user", "content": prompt}]
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload, timeout=40) as response:
                if response.status == 200:
                    data = await response.json()
                    if "choices" in data and len(data["choices"]) > 0:
                        content = data["choices"][0]["message"]["content"]
                        match = re.search(r'(/scrape\s+--query\s+.*)', content)
                        if match:
                            next_cmd = match.group(1).strip()
                            # Enforce preservation of the --no_website flag
                            if "--no_website" in previous_command and "--no_website" not in next_cmd:
                                next_cmd += " --no_website"
                            return next_cmd
    except Exception as e:
        print("Agent Smith Error:", e)
        
    return None
async def scrape(update: Update, context: ContextTypes.DEFAULT_TYPE):
    global is_scraping_running
    
    if is_scraping_running:
        await update.message.reply_text("❌ A scraping job is already actively running! Please wait for it to finish or use /stop to terminate it before starting a new one.")
        return
        
    try:
        import shlex
        # Sanitize smart punctuation (em-dashes and en-dashes from mobile keyboards)
        sanitized_text = update.message.text.replace("—", "--").replace("–", "--")
        text = sanitized_text.replace("/scrape", "").strip()
        
        use_agent_smith = True
        if "--no_agent_smith" in text:
            use_agent_smith = False
            text = text.replace("--no_agent_smith", "").strip()
        
        if not text:
            await update.message.reply_text(
                "❌ Incorrect Format\n\n"
                "Usage: /scrape --query \"plumbers\" --locality \"in USA\" --city \"Chicago\" --target 500\n"
                "You can pass any arguments supported by run_forever.py!"
            )
            return
            
        current_command = text
        
        while True:
            # Parse the text into terminal arguments
            args_list = shlex.split(current_command)
            
            agent_status = "🟢 Enabled" if use_agent_smith else "🔴 Disabled (--no_agent_smith)"
            
            await update.message.reply_text(
                f"🚀 Launching 24/7 Memory-Safe Scraper with custom flags...\n"
                f"Arguments: {' '.join(args_list)}\n"
                f"Agent Smith: {agent_status}\n\n"
                f"⚙️ I am monitoring the process. You can safely close Telegram."
            )
    
            # Execute run_forever.py and pass all user arguments directly to it
            if os.path.exists("target_update.txt"):
                os.remove("target_update.txt")
            if os.path.exists("status.json"):
                os.remove("status.json")
                
            cmd = [sys.executable, "-u", "run_forever.py"] + args_list
            
            # Run process asynchronously so the Telegram bot doesn't freeze
            with open("scraper.log", "w", encoding="utf-8") as f:
                f.write("--- SCRAPE SESSION STARTED ---\n")
                
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT
            )
            
            async def read_stream(stream):
                with open("scraper.log", "a", encoding="utf-8") as f:
                    while True:
                        try:
                            if os.path.exists("pause.flag"):
                                line = await stream.readline()
                            else:
                                # WATCHDOG: 180 seconds silence = deadlock
                                line = await asyncio.wait_for(stream.readline(), timeout=180.0)
                        except asyncio.TimeoutError:
                            if os.path.exists("pause.flag"): continue
                            error_msg = "\n[WATCHDOG] Scraper deadlocked! No output for 3 minutes. Terminating to self-heal...\n"
                            print(error_msg)
                            f.write(error_msg)
                            try:
                                import subprocess
                                # On Windows, process.kill() only kills the parent. We need to kill the entire tree to kill scraper.py and Chromium.
                                subprocess.call(['taskkill', '/F', '/T', '/PID', str(process.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                            except: 
                                pass
                            break
                            
                        if not line:
                            break
                        decoded = line.decode('utf-8', errors='replace')
                        try:
                            sys.stdout.write(decoded)
                        except UnicodeEncodeError:
                            sys.stdout.write(decoded.encode(sys.stdout.encoding, errors='replace').decode(sys.stdout.encoding))
                        sys.stdout.flush()
                        f.write(decoded)
                        f.flush()
                        
            await read_stream(process.stdout)
            await process.wait()
            
            if process.returncode == 0 or os.path.exists("stop_scraper.flag"):
                # Determine why it stopped
                reason = "Unknown"
                manual_stop = False
                if os.path.exists("stop_scraper.flag"):
                    reason = "Job was manually terminated by the /stop command."
                    manual_stop = True
                else:
                    reason = "Google Maps naturally exhausted all available results for this specific location query, or your requested target was perfectly reached."
                    
                # Count how many leads were extracted in this session
                extracted_count = 0
                if os.path.exists("google_maps_leads.xlsx"):
                    import pandas as pd
                    try:
                        df = pd.read_excel("google_maps_leads.xlsx")
                        extracted_count = len(df)
                    except:
                        pass
                        
                msg = f"✅ **Job Complete!**\n\n📊 **Session Leads Extracted:** {extracted_count}\n🛑 **Why it stopped:** {reason}\n\nI have attached your session's Excel file below. Your master Google Sheet has also been safely updated!"
                
                if os.path.exists("google_maps_leads.xlsx"):
                    await update.message.reply_document(
                        document=open("google_maps_leads.xlsx", "rb"), 
                        caption=msg,
                        parse_mode="Markdown"
                    )
                else:
                    await update.message.reply_text(f"{msg}\n\n(No Excel file was generated because 0 leads were found).", parse_mode="Markdown")
                
                # Log completed query to history
                try:
                    with open("scraped_places.txt", "a") as f:
                        date_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
                        f.write(f"[{date_str}] Command: {current_command} -> Extracted {extracted_count} leads.\n")
                except Exception:
                    pass
                    
                if manual_stop:
                    os.remove("stop_scraper.flag")
                    break # Exit infinite loop
                    
                if not use_agent_smith:
                    await update.message.reply_text("✅ Job completed! (Agent Smith disabled via flag). Autonomous loop terminated.")
                    break
                    
                await update.message.reply_text("🔄 Job completed (Target Reached or Boundary Exhausted). Waking up Agent Smith to decide the next target...")
                next_cmd = await ask_agent_smith(current_command, extracted_count)
                
                if next_cmd:
                    await update.message.reply_text(f"🕶️ **Agent Smith Decision:**\n`{next_cmd}`\n\nLaunching immediately...")
                    current_command = next_cmd.replace("/scrape", "").strip()
                else:
                    await update.message.reply_text("⚠️ Agent Smith failed to return a valid command. Terminating autonomous loop.")
                    break
            else:
                try:
                    with open("scraper.log", "r", encoding="utf-8") as f:
                        logs = f.read()
                        error_log = logs[-1000:] if len(logs) > 1000 else logs
                except:
                    error_log = "Could not read scraper.log for crash details."
                    
                if "[WATCHDOG]" in error_log:
                    await update.message.reply_text("🛡️ Watchdog effectively terminated the frozen Chromium engine. Instantly spinning up a fresh scraper instance to resume data extraction...")
                    continue
                else:
                    await update.message.reply_text(f"🚨 CRITICAL ERROR! The supervisor script crashed permanently or was forcefully killed.\n\nLogs:\n\n{error_log[-800:]}")
                    break
            
    except Exception as e:
        await update.message.reply_text(f"❌ Failed to parse command: {e}")
    finally:
        is_scraping_running = False

async def stop_scraper(update: Update, context: ContextTypes.DEFAULT_TYPE):
    with open("stop_scraper.flag", "w") as f:
        f.write("stop")
    await update.message.reply_text("🛑 Shutdown Signal Sent! The scraper will cleanly save all data, pack up the browser, and exit. Please wait a few seconds for the final Excel file.")

async def status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    import json
    if not os.path.exists("status.json"):
        await update.message.reply_text("⚪ No active scraping job found or status file not yet created.")
        return
        
    try:
        with open("status.json", "r") as f:
            data = json.load(f)
            
        msg = (
            f"🟢 **Live Status:**\n\n"
            f"📊 **Progress:** {data.get('leads_extracted', 0)} / {data.get('target', '?')} leads\n"
            f"🏢 **Currently Extracting:** {data.get('current_lead', 'Unknown')}\n"
        )
        await update.message.reply_text(msg, parse_mode="Markdown")
    except Exception as e:
        await update.message.reply_text(f"⚠️ Could not read status: {e}")
        
async def get_logs(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        if os.path.exists("scraper.log"):
            with open("scraper.log", "r", encoding="utf-8") as f:
                lines = f.readlines()
                last_lines = "".join(lines[-25:])
                if not last_lines.strip():
                    last_lines = "Log file is currently empty."
            await update.message.reply_text(f"Last 25 lines of terminal output:\n\n{last_lines}")
        else:
            await update.message.reply_text("Log file not found. Have you started a scrape session yet?")
    except Exception as e:
        await update.message.reply_text(f"Error reading logs: {e}")

async def new_target_update(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        text = update.message.text.replace("/new_target_update", "").strip()
        if not text.isdigit():
            await update.message.reply_text("❌ Please provide a valid number. Example: `/new_target_update 500`")
            return
            
        new_target = int(text)
        with open("target_update.txt", "w") as f:
            f.write(str(new_target))
            
        await update.message.reply_text(f"🎯 Target successfully dynamically updated to {new_target} leads! The scraper will stop at exactly {new_target}.")
    except Exception as e:
        await update.message.reply_text(f"❌ Failed to update target: {e}")

async def missing_websites(update: Update, context: ContextTypes.DEFAULT_TYPE):
    import pandas as pd
    import gspread
    
    await update.message.reply_text("🔄 Synchronizing local session with Google Sheets to catch any API timeout drops...")
    try:
        df = pd.read_excel('google_maps_leads.xlsx')
        
        # --- SYNC LOGIC ---
        gc = gspread.service_account(filename="service_account.json")
        sh = gc.open("Google Maps Leads")
        gs_worksheet = sh.worksheet("Sheet1")
        
        gs_data = gs_worksheet.get_all_values()
        headers = gs_data[0]
        
        client_id_col = headers.index("Client ID")
        
        # Build map of Client ID -> Google Sheet Row Index (1-based)
        gs_client_map = {}
        for r_idx, r in enumerate(gs_data):
            if r_idx == 0: continue
            if len(r) > client_id_col:
                cid = str(r[client_id_col]).strip()
                gs_client_map[cid] = r_idx + 1 # 1-based row for API
                
        updates = []
        appends = []
        
        for _, row in df.iterrows():
            cid = str(row['Client ID']).strip()
            
            if cid not in gs_client_map:
                # Row is missing due to timeout, insert it at its proper location (Client ID + 1)
                row_data = [str(row.get(col, "")) if pd.notna(row.get(col)) else "" for col in headers]
                # Prepend ' to phone numbers
                phone_idx = headers.index("Phone/WhatsApp") if "Phone/WhatsApp" in headers else -1
                if phone_idx != -1 and row_data[phone_idx] and not row_data[phone_idx].startswith("'"):
                    row_data[phone_idx] = f"'{row_data[phone_idx]}"
                
                try:
                    target_row_index = int(cid) + 1
                    gs_worksheet.insert_row(row_data, index=target_row_index, value_input_option='USER_ENTERED')
                    appends.append(cid)
                except ValueError:
                    # If Client ID is not an integer, fallback to append
                    gs_worksheet.append_row(row_data, value_input_option='USER_ENTERED')
                    appends.append(cid)
            else:
                # Row exists, check for empty cells in GS that are filled in Excel
                gs_row_num = gs_client_map[cid]
                gs_row_data = gs_data[gs_row_num - 1]
                
                for col_idx, col_name in enumerate(headers):
                    excel_val = str(row.get(col_name, "")).strip() if pd.notna(row.get(col_name)) else ""
                    if excel_val == "nan": excel_val = ""
                    
                    gs_val = str(gs_row_data[col_idx]).strip() if col_idx < len(gs_row_data) else ""
                    
                    # Special handling for phones to ignore the apostrophe difference
                    if col_name == "Phone/WhatsApp":
                        excel_p = excel_val.replace("'", "")
                        gs_p = gs_val.replace("'", "")
                        if excel_p and not gs_p:
                            updates.append({'range': f'{chr(65+col_idx)}{gs_row_num}', 'values': [[f"'{excel_p}"]]} )
                    else:
                        if excel_val and not gs_val:
                            updates.append({'range': f'{chr(65+col_idx)}{gs_row_num}', 'values': [[excel_val]]} )
                            
        if appends:
            await update.message.reply_text(f"⚠️ Restored {len(appends)} dropped leads to their exact original rows in Google Sheets!")
            
        if updates:
            await update.message.reply_text(f"⚠️ Found {len(updates)} missing data cells in Google Sheets! Patching them now...")
            gs_worksheet.batch_update(updates, value_input_option='USER_ENTERED')
            
        if appends or updates:
            await update.message.reply_text("✅ Sync Complete!")
            
        # --- END SYNC LOGIC ---

        missing = df[df['Website URL'].isna() | (df['Website URL'] == '') | (df['Website URL'].astype(str).str.strip() == '')]
        
        count = len(missing)
        if count == 0:
            await update.message.reply_text("✅ All leads currently have websites!")
            return
            
        with open("missing_websites.txt", "w") as f:
            for _, row in missing.iterrows():
                f.write(str(row['Client ID']) + "\n")
                
        await update.message.reply_document(
            document=open("missing_websites.txt", "rb"),
            caption=f"⚠️ Found {count} leads missing Website URLs. Attached are their Client IDs."
        )
    except Exception as e:
        await update.message.reply_text(f"❌ Failed to parse missing websites: {e}")

async def fix_empty_website_urls(update: Update, context: ContextTypes.DEFAULT_TYPE):
    global is_fixer_running
    
    if is_fixer_running:
        await update.message.reply_text("❌ The AI Rescue Tool is already actively running! Please wait for it to finish before starting a new one.")
        return
        
    is_fixer_running = True
    
    await update.message.reply_text("🛠️ Launching the AI Rescue Tool! The script is currently scanning the internet and patching the live Google Sheet for missing websites. I will text you the final `.xlsx` file when it completes. This may take a few minutes...")
    
    import subprocess
    import sys
    try:
        # Run asynchronously in a separate thread so bot doesn't freeze
        import asyncio
        process = await asyncio.create_subprocess_exec(
            sys.executable, "fix_websites.py",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode == 0:
            await update.message.reply_document(
                document=open('google_maps_leads.xlsx', 'rb'),
                caption="✅ Mass Patching Complete! The Google Sheet was live updated, and the new local Excel file is attached."
            )
        else:
            await update.message.reply_text(f"❌ The fixer script crashed!\n\nLogs: {stderr.decode()[:500]}")
    except Exception as e:
        await update.message.reply_text(f"❌ Failed to run fixer: {e}")
    finally:
        is_fixer_running = False

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    help_text = (
        "🤖 **Antigravity Scraper Bot - Command Menu**\n\n"
        "🟢 **Core Operations**\n"
        "🚀 `/scrape [args]` - Start a new extraction session.\n"
        "  *Available Flags:*\n"
        "  `--query \"...\"` (e.g. \"Gyms\")\n"
        "  `--locality \"...\"` (e.g. \"in USA\")\n"
        "  `--city \"...\"` (e.g. \"Texas\")\n"
        "  `--target N` (e.g. 500)\n"
        "  `--chunk_size N` (Clear memory every N leads)\n"
        "  `--end_date YYYY-MM-DD` (Scheduled stop date)\n"
        "  `--end_time HH:MM` (Scheduled stop time)\n"
        "  `--no_website` (Launch high-speed generic scraper)\n"
        "  `--no_agent_smith` (Disable autonomous Agent Smith restarts)\n\n"
        "🛑 `/stop` - Gracefully terminate active extraction and receive Excel file.\n\n"
        "⏸️ `/pause [minutes]` - Safely sleep the scraper without crashing the browser (e.g., `/pause 30`).\n\n"
        "▶️ `/resume` - Instantly wake the scraper from a paused state.\n\n"
        "📊 **Monitoring & Data**\n"
        "📈 `/status` - View live heartbeat, progress, and memory usage of active scraper.\n\n"
        "📝 `/logs` - Fetches the last 50 lines of live terminal output.\n\n"
        "🏓 `/ping` - Check if bot is alive and see scraper state (Active/Idle/Paused).\n\n"
        "🛠️ **Utilities**\n"
        "🎯 `/new_target_update [num]` - Dynamically lower/raise the target cap mid-run.\n\n"
        "❓ `/missing_websites` - Scan database and report leads missing websites.\n\n"
        "🔧 `/fix_empty_website_urls` - Launch Playwright AI Rescuer for missing websites.\n"
    )
    await update.message.reply_text(help_text, parse_mode="Markdown")

async def pause_bot(update, context):
    import os, time, asyncio
    args = context.args
    minutes = 0
    if args:
        try:
            minutes = int(args[0])
        except ValueError:
            pass
            
    with open("pause.flag", "w") as f: f.write("1")
    await update.message.reply_text(f"⏸️ Bot paused." + (f" It will auto-resume in {minutes} minutes." if minutes else " Type /resume to continue."))
    
    if minutes > 0:
        context.application.create_task(auto_resume(minutes, update))

async def auto_resume(minutes, update):
    import asyncio, os
    await asyncio.sleep(minutes * 60)
    if os.path.exists("pause.flag"):
        os.remove("pause.flag")
        await update.message.reply_text("▶️ Auto-resume triggered. Bot is continuing extraction!")

async def resume_bot(update, context):
    import os
    if os.path.exists("pause.flag"):
        os.remove("pause.flag")
        await update.message.reply_text("▶️ Bot resumed!")
    else:
        await update.message.reply_text("Bot is not paused.")

async def ping(update, context):
    global is_scraping_running
    status = "Active" if is_scraping_running else "Idle"
    paused = " (PAUSED)" if __import__("os").path.exists("pause.flag") else ""
    await update.message.reply_text(f"🏓 Pong! Bot is alive and responsive.\nScraper Status: {status}{paused}")


def main():
    if not BOT_TOKEN:
        print("⚠️ ERROR: TELEGRAM_BOT_TOKEN not found in .env file!")
        return
        
    print("[READY] Telegram Bot is online and listening!")
    print("Send a message to your bot on your phone to start scraping.")
    
    import time
    while True:
        try:
            # We MUST build a fresh Application instance every time we poll.
            # If a fatal error closes the internal asyncio event loop, reusing the old app will throw "Event loop is closed"
            app = Application.builder().token(BOT_TOKEN).build()
            app.add_handler(CommandHandler("start", help_command, block=False))
            app.add_handler(CommandHandler("help", help_command, block=False))
            app.add_handler(CommandHandler("commands", help_command, block=False))
            app.add_handler(CommandHandler("scrape", scrape, block=False))
            app.add_handler(CommandHandler("stop", stop_scraper, block=False))
            app.add_handler(CommandHandler("status", status, block=False))
            app.add_handler(CommandHandler("logs", get_logs, block=False))
            app.add_handler(CommandHandler("new_target_update", new_target_update, block=False))
            app.add_handler(CommandHandler("missing_websites", missing_websites, block=False))
            app.add_handler(CommandHandler("fix_empty_website_urls", fix_empty_website_urls, block=False))
            app.add_handler(CommandHandler("pause", pause_bot, block=False))
            app.add_handler(CommandHandler("resume", resume_bot, block=False))
            app.add_handler(CommandHandler("ping", ping, block=False))
            
            app.run_polling(drop_pending_updates=True)
            break
        except KeyboardInterrupt:
            print("\n[SHUTDOWN] Bot stopped by user (Ctrl+C). Exiting cleanly...")
            break
        except Exception as e:
            print(f"\n[CRITICAL ERROR] Network connection lost: {e}")
            print("Restarting polling in 10 seconds to auto-recover...")
            try:
                time.sleep(10)
            except KeyboardInterrupt:
                print("\n[SHUTDOWN] Bot stopped by user (Ctrl+C) during recovery wait. Exiting cleanly...")
                break

if __name__ == "__main__":
    main()
