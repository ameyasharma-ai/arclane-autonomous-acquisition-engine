import sys
import asyncio
import re
import datetime
from urllib.parse import quote_plus
import pandas as pd
from playwright.async_api import async_playwright
from playwright_stealth import Stealth
import aiohttp
from bs4 import BeautifulSoup
import os
from dotenv import load_dotenv
import time
import builtins
from datetime import datetime


# Hijack the built-in print function to inject timestamps globally
original_print = builtins.print
def timestamped_print(*args, **kwargs):
    timestamp = datetime.now().strftime("[%Y-%m-%d %H:%M:%S]")
    original_print(timestamp, *args, **kwargs)
builtins.print = timestamped_print

load_dotenv()

def extract_phone_from_url_or_text(text):
    if not text:
        return ""
    import re
    # 1. Check wa.me / whatsapp links (e.g. https://wa.me/918469109609 or ?phone=918469109609)
    wa_match = re.search(r'(?:wa\.me\/|whatsapp\.com\/send\?phone=|api\.whatsapp\.com\/send\?phone=)(\+?\d{10,15})', text, re.I)
    if wa_match:
        digits = re.sub(r'\D', '', wa_match.group(1))
        if len(digits) == 10:
            return '+91' + digits
        elif len(digits) >= 11:
            return '+' + digits
            
    # 2. Check tel: links
    tel_match = re.search(r'tel:(\+?\d{10,15})', text, re.I)
    if tel_match:
        digits = re.sub(r'\D', '', tel_match.group(1))
        if len(digits) == 10:
            return '+91' + digits
        elif len(digits) >= 11:
            return '+' + digits

    # 3. Check Indian standard mobile number patterns (+91 / 0 / 10 digits starting with 6-9)
    in_match = re.search(r'(?:(?:\+|00)91[\s-]?)?(?:0)?[6-9]\d{9}', text)
    if in_match:
        digits = re.sub(r'\D', '', in_match.group(0))
        if len(digits) == 10:
            return '+91' + digits
        elif len(digits) == 11 and digits.startswith('0'):
            return '+91' + digits[1:]
        elif len(digits) == 12 and digits.startswith('91'):
            return '+' + digits
    return ""


BLACKLISTED_URLS = []
INTEREST_URLS = []
try:
    with open("blacklisted_urls.txt", "r") as f:
        for line in f:
            line = line.strip().lower()
            if not line:
                continue
            parts = line.split(",")
            domain = parts[0].strip()
            BLACKLISTED_URLS.append(domain)
            if len(parts) > 1 and parts[1].strip() == "website_of_interest":
                INTEREST_URLS.append(domain)
except Exception:
    pass

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")

import json

# --- LOAD DYNAMIC CONFIGURATION ---
try:
    with open("config/settings.json", "r", encoding="utf-8") as f:
        CONFIG = json.load(f)
except Exception as e:
    print(f"[WARNING] Could not load config/settings.json, using defaults. Error: {e}")
    CONFIG = {"scraper": {"max_review_scrolls": 50, "max_reviews_extracted": 300, "llm_api_timeout_seconds": 180, "page_load_timeout_ms": 90000, "element_wait_timeout_ms": 15000, "gspread_max_retries": 5, "feed_scroll_limit": 300}}

MAX_REVIEW_SCROLLS = CONFIG["scraper"].get("max_review_scrolls", 50)
MAX_REVIEWS_EXTRACTED = CONFIG["scraper"].get("max_reviews_extracted", 300)
LLM_TIMEOUT = CONFIG["scraper"].get("llm_api_timeout_seconds", 180)
PAGE_TIMEOUT = CONFIG["scraper"].get("page_load_timeout_ms", 90000)
ELEM_TIMEOUT = CONFIG["scraper"].get("element_wait_timeout_ms", 15000)
GSPREAD_RETRIES = CONFIG["scraper"].get("gspread_max_retries", 5)
FEED_SCROLL_LIMIT = CONFIG["scraper"].get("feed_scroll_limit", 300)

LLM_CONFIG = CONFIG.get("llm", {})
PRIMARY_PROVIDER = LLM_CONFIG.get("primary_provider", "gemini")
PRIMARY_MODEL = LLM_CONFIG.get("primary_model", "gemini-flash-lite-latest")
FALLBACK_MODELS = LLM_CONFIG.get("fallback_models", [
    "nvidia/nemotron-nano-9b-v2:free",
    "openai/gpt-oss-120b:free",
    "openrouter/free",
    "tencent/hy3-preview:free",
    "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    "liquid/lfm-2.5-1.2b-instruct:free",
    "qwen/qwen3-coder:free"
])
GEMINI_KEYS_ENV = LLM_CONFIG.get("gemini_keys_env", ["GEMINI_REVIEWS_API_KEY", "GEMINI_REVIEWS_CLEANER_KEY"])
OPENROUTER_KEYS_ENV = LLM_CONFIG.get("openrouter_keys_env", ["OPENROUTER_API_KEY", "OPENROUTER_API_KEY_AGENT_SMITH", "OPENROUTER_API_KEY_CLEANER"])

# Gemini Key Pool Manager
gemini_key_pool = []
for env_var in GEMINI_KEYS_ENV:
    val = os.getenv(env_var, "").strip()
    if val:
        gemini_key_pool.append((env_var, val))

current_key_idx = 0

# OpenRouter Key Pool Manager
openrouter_key_pool = []
for env_var in OPENROUTER_KEYS_ENV:
    val = os.getenv(env_var, "").strip()
    if val:
        openrouter_key_pool.append((env_var, val))

current_or_key_idx = 0

def load_dynamic_settings():
    global CONFIG, PRIMARY_PROVIDER, PRIMARY_MODEL, FALLBACK_MODELS, GEMINI_KEYS_ENV, OPENROUTER_KEYS_ENV, gemini_key_pool, openrouter_key_pool, LLM_TIMEOUT
    try:
        with open("config/settings.json", "r", encoding="utf-8") as f:
            CONFIG = json.load(f)
        llm_config = CONFIG.get("llm", {})
        PRIMARY_PROVIDER = llm_config.get("primary_provider", "gemini")
        PRIMARY_MODEL = llm_config.get("primary_model", "gemini-flash-lite-latest")
        FALLBACK_MODELS = llm_config.get("fallback_models", FALLBACK_MODELS)
        GEMINI_KEYS_ENV = llm_config.get("gemini_keys_env", GEMINI_KEYS_ENV)
        OPENROUTER_KEYS_ENV = llm_config.get("openrouter_keys_env", OPENROUTER_KEYS_ENV)
        LLM_TIMEOUT = CONFIG["scraper"].get("llm_api_timeout_seconds", 180)
        
        # Reload key pool (preserve index safety)
        new_pool = []
        for env_var in GEMINI_KEYS_ENV:
            val = os.getenv(env_var, "").strip()
            if val:
                new_pool.append((env_var, val))
        gemini_key_pool = new_pool
        
        # Reload OR key pool
        new_or_pool = []
        for env_var in OPENROUTER_KEYS_ENV:
            val = os.getenv(env_var, "").strip()
            if val:
                new_or_pool.append((env_var, val))
        openrouter_key_pool = new_or_pool
    except Exception:
        pass

def get_current_gemini_key():
    if not gemini_key_pool:
        return None, None
    return gemini_key_pool[current_key_idx]

def rotate_gemini_key():
    global current_key_idx
    if not gemini_key_pool or len(gemini_key_pool) <= 1:
        return False
    current_key_idx = (current_key_idx + 1) % len(gemini_key_pool)
    name, _ = gemini_key_pool[current_key_idx]
    print(f"[Key Rotator] Rate limit or quota hit. Rotating to next Gemini key: {name}")
    return True

def get_current_openrouter_key():
    if not openrouter_key_pool:
        return None, None
    return openrouter_key_pool[current_or_key_idx]

def rotate_openrouter_key():
    global current_or_key_idx
    if not openrouter_key_pool or len(openrouter_key_pool) <= 1:
        return False
    current_or_key_idx = (current_or_key_idx + 1) % len(openrouter_key_pool)
    name, _ = openrouter_key_pool[current_or_key_idx]
    print(f"[OpenRouter Key Rotator] Rate limit or quota hit. Rotating to next OpenRouter key: {name}")
    return True


import json




def clean_business_name(name):
    if not name:
        return ""
    return re.sub(r'\s+', ' ', str(name).strip().lower())

def get_canonical_maps_key(url):
    if not url:
        return ""
    # 1. Try to extract hex coordinate pair e.g. 0x39ed5f702013df2f:0xb5bfef223d5fd61b
    hex_match = re.search(r'(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)', url)
    if hex_match:
        return hex_match.group(1).lower()
    
    # 2. Try to extract CID/Place ID e.g. ChIJ...
    chij_match = re.search(r'(ChIJ[a-zA-Z0-9_-]{23,})', url)
    if chij_match:
        return chij_match.group(1)
        
    # 3. Fallback to name in path e.g. /place/Name
    place_match = re.search(r'/place/([^/]+)', url)
    if place_match:
        return place_match.group(1).replace('+', ' ').lower()
        
    return url.strip().lower()

class GeminiRateLimiter:
    def __init__(self, max_rpm=10):
        self.max_rpm = max_rpm
        self.request_times = []

    async def wait_if_needed(self):
        now = time.time()
        self.request_times = [t for t in self.request_times if now - t < 60]
        if len(self.request_times) >= self.max_rpm:
            sleep_time = 60 - (now - self.request_times[0])
            if sleep_time > 0:
                print(f"      [Rate Limiter] Approaching Gemini RPM limit. Pacing: sleeping for {sleep_time:.2f}s...")
                await asyncio.sleep(sleep_time)
        self.request_times.append(time.time())

gemini_limiter = GeminiRateLimiter(max_rpm=10)

async def interruptible_sleep(seconds):
    for _ in range(int(seconds)):
        if os.path.exists("stop_scraper.flag"):
            return False
        await asyncio.sleep(1)
    return True

async def extract_city_state_llm(address):
    load_dynamic_settings()
    models = FALLBACK_MODELS
    
    try:
        with open("prompts/city_state_extractor.txt", "r", encoding="utf-8") as f:
            prompt_template = f.read()
        prompt = prompt_template.format(address=address)
    except Exception as e:
        print(f"Error loading prompt city_state_extractor.txt: {e}")
        return "Failed to extract", "Failed to extract", "Failed to extract", "Failed to extract"
    
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    
    async with aiohttp.ClientSession() as session:
        # PRIMARY: Try Google Gemini API first
        if PRIMARY_PROVIDER == "gemini":
            gemini_payload = {
                "contents": [{"parts": [{"text": prompt}]}]
            }
            for attempt in range(2):
                var_name, gemini_key = get_current_gemini_key()
                if not gemini_key:
                    break
                gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{PRIMARY_MODEL}:generateContent?key={gemini_key}"
                try:
                    await gemini_limiter.wait_if_needed()
                    async with session.post(gemini_url, json=gemini_payload, timeout=LLM_TIMEOUT) as response:
                        if response.status == 200:
                            data = await response.json()
                            if "candidates" in data and len(data["candidates"]) > 0:
                                content = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                                import re
                                loc_match = re.search(r'LOCALITY:\s*(.*?)\s*\|', content, re.IGNORECASE)
                                city_match = re.search(r'CITY:\s*(.*?)\s*\|', content, re.IGNORECASE)
                                state_match = re.search(r'STATE:\s*(.*?)\s*\|', content, re.IGNORECASE)
                                country_match = re.search(r'COUNTRY:\s*(.*?)$', content, re.IGNORECASE)
                                if loc_match and city_match and state_match and country_match:
                                    l = loc_match.group(1).strip()
                                    c = city_match.group(1).strip()
                                    s = state_match.group(1).strip()
                                    co = country_match.group(1).strip()
                                    print(f"      [Gemini API] Successfully parsed Locality='{l}', City='{c}', State='{s}', Country='{co}'")
                                    return l, c, s, co
                        elif response.status == 429:
                            err_data = await response.json()
                            retry_seconds = 5
                            try:
                                for detail in err_data.get("error", {}).get("details", []):
                                    if "retryDelay" in detail:
                                        delay_str = detail["retryDelay"]
                                        match = re.search(r'(\d+)', delay_str)
                                        if match:
                                            retry_seconds = int(match.group(1))
                                            break
                            except Exception:
                                pass
                            sleep_time = retry_seconds + 5
                            print(f"      [Gemini API] Rate limited (429) using key {var_name}.")
                            if rotate_gemini_key():
                                print("      [Gemini API] Rotated key. Retrying immediately...")
                                continue
                            else:
                                print(f"      [Gemini API] No alternative keys available. Waiting {sleep_time}s before retrying (Attempt {attempt+1}/2)...")
                                if not await interruptible_sleep(sleep_time): return "Failed to extract", "Failed to extract", "Failed to extract", "Failed to extract"
                                continue
                        else:
                            print(f"      [Gemini API] Error: {response.status} - {await response.text()}")
                            break
                except Exception as e:
                    print(f"      [Gemini API] Exception: {e}")
                    await asyncio.sleep(2)

        # FALLBACK: OpenRouter cascade
        for model in models:
            for attempt in range(2):
                var_name, or_key = get_current_openrouter_key()
                if not or_key:
                    break
                headers = {
                    "Authorization": f"Bearer {or_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}]
                }
                try:
                    async with session.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload, timeout=20) as response:
                        if response.status == 200:
                            data = await response.json()
                            if "choices" in data and len(data["choices"]) > 0:
                                content = data["choices"][0]["message"]["content"].strip()
                                import re
                                loc_match = re.search(r'LOCALITY:\s*(.*?)\s*\|', content, re.IGNORECASE)
                                city_match = re.search(r'CITY:\s*(.*?)\s*\|', content, re.IGNORECASE)
                                state_match = re.search(r'STATE:\s*(.*?)\s*\|', content, re.IGNORECASE)
                                country_match = re.search(r'COUNTRY:\s*(.*?)$', content, re.IGNORECASE)
                                if loc_match and city_match and state_match and country_match:
                                    l = loc_match.group(1).strip()
                                    c = city_match.group(1).strip()
                                    s = state_match.group(1).strip()
                                    co = country_match.group(1).strip()
                                    print(f"      [LLM Fallback] Successfully parsed with {model}: Locality='{l}', City='{c}', State='{s}', Country='{co}'")
                                    return l, c, s, co
                        elif response.status == 429:
                            print(f"      [LLM Fallback] Rate limited (429) for {model} using key {var_name}.")
                            if rotate_openrouter_key():
                                print("      [LLM Fallback] Rotated OpenRouter key. Retrying immediately...")
                                continue
                            else:
                                print("      [LLM Fallback] No alternative OpenRouter keys. Trying next model...")
                                break
                        else:
                            break
                except Exception:
                    break
                
    return "Failed to extract", "Failed to extract", "Failed to extract", "Failed to extract"

async def generate_review_overview(reviews_text):
    load_dynamic_settings()
    if not reviews_text or len(reviews_text) < 10:
        return ""
        
    models = FALLBACK_MODELS
    
    try:
        with open("prompts/review_analysis.txt", "r", encoding="utf-8") as f:
            prompt_template = f.read()
        prompt = prompt_template.format(reviews_text=reviews_text)
    except Exception as e:
        print(f"Error loading prompt review_analysis.txt: {e}")
        return ""
    
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    
    async with aiohttp.ClientSession() as session:
        # PRIMARY: Try Google Gemini API first
        if PRIMARY_PROVIDER == "gemini":
            gemini_payload = {
                "contents": [{"parts": [{"text": prompt}]}]
            }
            for attempt in range(2):
                var_name, gemini_key = get_current_gemini_key()
                if not gemini_key:
                    break
                gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{PRIMARY_MODEL}:generateContent?key={gemini_key}"
                try:
                    await gemini_limiter.wait_if_needed()
                    async with session.post(gemini_url, json=gemini_payload, timeout=LLM_TIMEOUT) as response:
                        if response.status == 200:
                            data = await response.json()
                            if "candidates" in data and len(data["candidates"]) > 0:
                                content = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                                content = content.replace('"', '').replace('\n', ' ')
                                print("  [Gemini API] Successfully generated review analysis.")
                                return content
                        elif response.status == 429:
                            err_data = await response.json()
                            retry_seconds = 5
                            try:
                                for detail in err_data.get("error", {}).get("details", []):
                                    if "retryDelay" in detail:
                                        delay_str = detail["retryDelay"]
                                        match = re.search(r'(\d+)', delay_str)
                                        if match:
                                            retry_seconds = int(match.group(1))
                                            break
                            except Exception:
                                pass
                            sleep_time = retry_seconds + 5
                            print(f"  [Gemini API] Rate limited (429) using key {var_name}.")
                            if rotate_gemini_key():
                                print("  [Gemini API] Rotated key. Retrying immediately...")
                                continue
                            else:
                                print(f"  [Gemini API] No alternative keys available. Waiting {sleep_time}s before retrying (Attempt {attempt+1}/2)...")
                                if not await interruptible_sleep(sleep_time): return ""
                                continue
                        else:
                            print(f"  [Gemini API] Error: {response.status} - {await response.text()}")
                            break
                except Exception as e:
                    print(f"  [Gemini API] Exception: {e}")
                    await asyncio.sleep(2)
                
        # FALLBACK: Loop through OpenRouter models with 5 retries each if Gemini fails
        print("  [OpenRouter API] Falling back to OpenRouter...")
        for model in models:
            for attempt in range(2):
                var_name, or_key = get_current_openrouter_key()
                if not or_key:
                    break
                headers = {
                    "Authorization": f"Bearer {or_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}]
                }
                try:
                    async with session.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload, timeout=20) as response:
                        if response.status == 200:
                            data = await response.json()
                            if "choices" in data and len(data["choices"]) > 0:
                                content = data["choices"][0]["message"]["content"].strip()
                                content = content.replace('"', '').replace('\n', ' ')
                                print(f"  [OpenRouter API] Successfully generated using {model}.")
                                return content
                        elif response.status == 401:
                            print("  [OpenRouter API] Error: 401 Unauthorized. Key is invalid. Skipping all OpenRouter models.")
                            return ""
                        elif response.status == 429:
                            print(f"  [OpenRouter API] Rate limited (429) for {model} using key {var_name}.")
                            if rotate_openrouter_key():
                                print("  [OpenRouter API] Rotated OpenRouter key. Retrying immediately...")
                                continue
                            else:
                                print(f"  [OpenRouter API] No alternative OpenRouter keys available. Skipping model.")
                                break
                        elif response.status in [408, 502, 503, 504]:
                            print(f"  [OpenRouter API] {response.status} for {model}. Retrying in 10s...")
                            if not await interruptible_sleep(10): return ""
                        else:
                            print(f"  [OpenRouter API] Error: {response.status}. Trying next model...")
                            break
                except asyncio.TimeoutError:
                    print(f"  [OpenRouter API] Timeout for {model}. Retrying in 10s...")
                    if not await interruptible_sleep(10): return ""
                except Exception as e:
                    print(f"  [OpenRouter API] Exception for {model}: {e}. Trying next model...")
                    break
                break # Break the model loop if key is dead
                
    return ""

async def clean_lead_with_llm(lead_dict):
    load_dynamic_settings()
    openrouter_key = os.getenv("OPENROUTER_API_KEY_CLEANER", "").strip()
    
    context_str = (
        f"Client ID: {lead_dict.get('Client ID', '')}\n"
        f"Date: {lead_dict.get('Date', '')}\n"
        f"Business Name: {lead_dict.get('Business Name', '')}\n"
        f"Industry/Niche: {lead_dict.get('Industry/Niche', '')}\n"
        f"City/State: {lead_dict.get('City/State', '')}\n"
        f"Phone/WhatsApp: {lead_dict.get('Phone/WhatsApp', '')}"
    )

    raw_data_str = (
        f"Website URL: {lead_dict.get('Website URL', '')}\n"
        f"Email: {lead_dict.get('Email', '')}\n"
        f"Instagram: {lead_dict.get('Instagram', '')}\n"
        f"Facebook: {lead_dict.get('Facebook', '')}\n"
        f"X (Twitter): {lead_dict.get('X (Twitter)', '')}\n"
        f"YouTube: {lead_dict.get('YouTube', '')}\n"
        f"TikTok: {lead_dict.get('TikTok', '')}\n"
        f"LinkedIn: {lead_dict.get('LinkedIn', '')}"
    )

    try:
        with open("prompts/data_cleaner.txt", "r", encoding="utf-8") as f:
            prompt_template = f.read()
        prompt = prompt_template.format(context_str=context_str, raw_data_str=raw_data_str)
    except Exception as e:
        print(f"Error loading prompt data_cleaner.txt: {e}")
        return lead_dict.copy()

    gemini_payload = {
        "contents": [{"parts": [{"text": prompt}]}]
    }

    models = FALLBACK_MODELS

    headers = {
        "Authorization": f"Bearer {openrouter_key}",
        "Content-Type": "application/json"
    }

    cleaned_lead = lead_dict.copy()
    gemini_success = False

    try:
        import re, json
        async with aiohttp.ClientSession() as session:
            if PRIMARY_PROVIDER == "gemini":
                for attempt in range(2):
                    var_name, gemini_key = get_current_gemini_key()
                    if not gemini_key:
                        break
                    gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{PRIMARY_MODEL}:generateContent?key={gemini_key}"
                    print(f"  [LLM Cleaner] Sending raw data to Gemini ({PRIMARY_MODEL}) using key {var_name} for deep cleaning...")
                    try:
                        await gemini_limiter.wait_if_needed()
                        async with session.post(gemini_url, json=gemini_payload, timeout=LLM_TIMEOUT) as response:
                            if response.status == 200:
                                data = await response.json()
                                if "candidates" in data and len(data["candidates"]) > 0:
                                    content = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                                    json_match = re.search(r'\{.*\}', content, re.DOTALL)
                                    if json_match:
                                        try:
                                            parsed = json.loads(json_match.group(0))
                                            for key in ["Website URL", "Email", "Instagram", "Facebook", "X (Twitter)", "YouTube", "TikTok", "LinkedIn"]:
                                                if key in parsed:
                                                    val = str(parsed[key]).strip()
                                                    if val.lower() in ["none", "null", "n/a", ""]:
                                                        val = ""
                                                    cleaned_lead[key] = val
                                            print("  [LLM Cleaner] Successfully cleaned data!")
                                            gemini_success = True
                                            break
                                        except json.JSONDecodeError:
                                            print("  [LLM Cleaner] Error: Failed to parse JSON response.")
                                            break
                                    else:
                                        print("  [LLM Cleaner] Error: No JSON found in response.")
                                        break
                            elif response.status == 429:
                                err_data = await response.json()
                                retry_seconds = 5
                                try:
                                    for detail in err_data.get("error", {}).get("details", []):
                                        if "retryDelay" in detail:
                                            delay_str = detail["retryDelay"]
                                            match = re.search(r'(\d+)', delay_str)
                                            if match:
                                                retry_seconds = int(match.group(1))
                                                break
                                except Exception:
                                    pass
                                sleep_time = retry_seconds + 5
                                print(f"  [LLM Cleaner] Rate limited (429) using key {var_name}.")
                                if rotate_gemini_key():
                                    print("  [LLM Cleaner] Rotated key. Retrying immediately...")
                                    continue
                                else:
                                    print(f"  [LLM Cleaner] No alternative keys available. Waiting {sleep_time}s before retrying (Attempt {attempt+1}/2)...")
                                    if not await interruptible_sleep(sleep_time): return cleaned_lead
                                    continue
                            else:
                                print(f"  [LLM Cleaner] API Error: {response.status} - Gemini failed.")
                                break
                    except Exception as e:
                        print(f"  [LLM Cleaner] Exception during cleaning call: {e}")
                        await asyncio.sleep(2)

            if not gemini_success:
                print("  [LLM Cleaner] Falling back to OpenRouter cascade...")
                for model in models:
                    for attempt in range(2):
                        var_name, or_key = get_current_openrouter_key()
                        if not or_key:
                            break
                        headers = {
                            "Authorization": f"Bearer {or_key}",
                            "Content-Type": "application/json"
                        }
                        payload = {
                            "model": model,
                            "messages": [{"role": "user", "content": prompt}]
                        }
                        try:
                            async with session.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload, timeout=20) as response:
                                if response.status == 200:
                                    data = await response.json()
                                    if "choices" in data and len(data["choices"]) > 0:
                                        content = data["choices"][0]["message"]["content"].strip()
                                        json_match = re.search(r'\{.*\}', content, re.DOTALL)
                                        if json_match:
                                            try:
                                                parsed = json.loads(json_match.group(0))
                                                for key in ["Website URL", "Email", "Instagram", "Facebook", "X (Twitter)", "YouTube", "TikTok", "LinkedIn"]:
                                                    if key in parsed:
                                                        val = str(parsed[key]).strip()
                                                        if val.lower() in ["none", "null", "n/a", ""]:
                                                            val = ""
                                                        cleaned_lead[key] = val
                                                print(f"  [LLM Cleaner] Successfully cleaned data using {model}!")
                                                return cleaned_lead
                                            except json.JSONDecodeError:
                                                pass
                                        break # Stop retrying if 200 OK but bad JSON
                                elif response.status == 401:
                                    print("  [LLM Cleaner] Error: 401 Unauthorized for OpenRouter. Skipping cascade.")
                                    return cleaned_lead
                                elif response.status == 429:
                                    print(f"  [LLM Cleaner] Rate limited (429) for {model} using key {var_name}.")
                                    if rotate_openrouter_key():
                                        print("  [LLM Cleaner] Rotated OpenRouter key. Retrying immediately...")
                                        continue
                                    else:
                                        print("  [LLM Cleaner] No alternative OpenRouter keys. Trying next model...")
                                        break
                                elif response.status in [408, 502, 503, 504]:
                                    print(f"  [LLM Cleaner] {response.status} for {model}. Retrying in 10s...")
                                    if not await interruptible_sleep(10): return cleaned_lead
                                else:
                                    print(f"  [LLM Cleaner] Error {response.status} for {model}. Trying next model...")
                                    break
                        except asyncio.TimeoutError:
                            print(f"  [LLM Cleaner] Timeout for {model}. Retrying in 10s...")
                            if not await interruptible_sleep(10): return cleaned_lead
                        except Exception as e:
                            print(f"  [LLM Cleaner] Exception for {model}: {e}. Trying next model...")
                            break
    except Exception as e:
        print(f"  [LLM Cleaner] Exception: {e}")
        
    return cleaned_lead

# --- CONFIGURATION VARIABLES ---
SPREADSHEET_NAME = "Google Maps Leads"
WORKSHEET_NAME = "Sheet1"
SERVICE_ACCOUNT_FILE = "service_account.json"

# --- SCRIPT ---
COLUMNS = [
    "Client ID", "Date Added", "Business Name", "Industry/Niche", "City/State", 
    "Phone/WhatsApp", "Website URL", "Email", "Instagram", "Facebook", "X (Twitter)", "YouTube", "TikTok", "LinkedIn", "Ratings", "Number Of Reviews", 
    "Timings", "Address", "Maps URL", "Owner Name", "Contact Person", 
    "AI Outreach Hook", "Outreach Platform", "Outreach Date", "Follow-Up Date", "Current Status", "Priority Level", 
    "Interested Services", "Pain Points", "Project Type", "Estimated Budget", 
    "Quoted Price", "Negotiation Status", "Meeting Scheduled", "Meeting Date", 
    "Proposal Sent", "Contract Sent", "Payment Status", "Advance Received", 
    "Final Payment", "Delivery Deadline", "Project Status", "Testimonials Received", 
    "Referral Potential", "Notes"
]

def clean_industry(query, loc, cit):
    stop_words = ["in", "near", "at", "around", "on", "the", loc.lower(), cit.lower()]
    query_lower = query.lower()
    loc_lower = loc.lower()
    
    if loc_lower in query_lower:
        query_lower = query_lower.replace(loc_lower, "").strip()
        
    words = query_lower.split()
    cleaned_words = [w for w in words if w not in stop_words]
    
    if not cleaned_words:
        return query.title()
    return " ".join(cleaned_words).title()

async def crawl_website(url, context, maps_socials=None):
    results = {
        "Email": set(),
        "Instagram": set(),
        "LinkedIn": set(),
        "Facebook": set(),
        "X (Twitter)": set(),
        "YouTube": set(),
        "TikTok": set(),
        "Owner Name": "",
        "Contact Person": "",
        "Meta Vibe": "",
        "Menu Services": set()
    }
    
    if maps_socials:
        for k in results.keys():
            if k in maps_socials and isinstance(results[k], set):
                results[k].update(maps_socials[k])

    if not url:
        return format_socials(results)

    if not url.startswith('http'):
        url = 'https://' + url
        
    page = await context.new_page()
    visited = set()
    to_visit = [url]
    internal_links = set([url])
    
    # Crawl up to 15 sub-pages to guarantee deep coverage
    MAX_PAGES = 15
    pages_crawled = 0
    
    try:
        while to_visit and pages_crawled < MAX_PAGES:
            current_url = to_visit.pop(0)
            if current_url in visited:
                continue
                
            visited.add(current_url)
            pages_crawled += 1
            
            total_pages = min(pages_crawled + len(to_visit), MAX_PAGES)
            print(f"  [Deep Crawl]  | Crawling {pages_crawled}/{total_pages}   | {current_url}")
            
            try:
                await page.goto(current_url, timeout=60000, wait_until="domcontentloaded")
                
                # Intelligently close popups (Cookies, Overlays)
                try:
                    popup_selectors = [
                        "button:has-text('Accept')", "button:has-text('Agree')",
                        "button:has-text('Got it')", "button:has-text('Close')",
                        "button:has-text('Allow cookies')", ".cookie-banner button",
                        "[aria-label='Close']"
                    ]
                    for selector in popup_selectors:
                        elements = await page.query_selector_all(selector)
                        for el in elements:
                            if await el.is_visible():
                                await el.click(timeout=1000)
                except Exception:
                    pass
                    
                # Visually scroll to bottom to guarantee all lazy-loaded footers and elements trigger
                try:
                    await page.evaluate('''async () => {
                        await new Promise((resolve) => {
                            let totalHeight = 0;
                            let distance = 3000;
                            let maxScrolls = 40; // 120,000 pixels deep
                            let scrolls = 0;
                            let timer = setInterval(() => {
                                let scrollHeight = document.body.scrollHeight;
                                window.scrollBy(0, distance);
                                totalHeight += distance;
                                scrolls++;
                                if(totalHeight >= scrollHeight || scrolls >= maxScrolls){
                                    clearInterval(timer);
                                    resolve();
                                }
                            }, 100); // 100ms micro-interval (generous scrolling)
                        });
                    }''')
                except Exception:
                    pass
                
                # Smart SPA Delay: Wait for React/Next.js to fully hydrate the DOM before ripping
                if pages_crawled == 1:
                    await page.wait_for_timeout(10000)
                else:
                    await page.wait_for_timeout(5000)
                
                html = await page.content()
                
                # Extract emails (Robust Universal Regex with strict TLDs)
                import re
                valid_tlds = r'(?:com|net|org|edu|gov|mil|int|info|biz|name|pro|aero|coop|museum|jobs|travel|mobi|cat|tel|asia|post|arpa|io|me|tv|ai|app|dev|tech|store|shop|online|site|website|club|xyz|global|[a-z]{2})'
                found_emails = re.findall(rf'\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.{valid_tlds})\b', html, re.IGNORECASE)
                generic_emails = ['user@', 'example', 'filler@', 'domain.com', 'mysite.com', 'godaddy.com', 'wix', 'sentry', 'email.com', '.png', '.jpg', '.jpeg', '.gif', '.css', '.js', 'checkout.if', 'name@', 'test@']
                for e in found_emails:
                    if not any(x in e.lower() for x in generic_emails):
                        clean_e = e.lower()
                        if clean_e not in results["Email"]:
                            print(f"  [Deep Crawl]  | {'Email'.ljust(11)} | {clean_e}")
                            results["Email"].add(clean_e)
                        
                # Industry robust technique: Parse obfuscated emails (All known patterns, strict TLDs)
                obfuscation_pattern = rf'([A-Za-z0-9._%+-]+)\s*(?:\[at\]|\(at\)|[{{]at[}}]|<at>|@|\bAT\b|\bat\b|_at_|-at-)\s*([A-Za-z0-9.-]+)\s*(?:\[dot\]|\(dot\)|[{{]dot[}}]|<dot>|\.|\bDOT\b|\bdot\b|_dot_|-dot-)\s*({valid_tlds})\b'
                obfuscated = re.findall(obfuscation_pattern, html, re.IGNORECASE)
                for parts in obfuscated:
                    e = f"{parts[0]}@{parts[1]}.{parts[2]}"
                    if not any(x in e.lower() for x in generic_emails):
                        clean_e = e.lower()
                        if clean_e not in results["Email"]:
                            print(f"  [Deep Crawl]  | {'Email'.ljust(11)} | {clean_e}")
                            results["Email"].add(clean_e)
                        
                # Explicitly parse mailto: links without fail (case-insensitive, URL decoded, comma-separated)
                try:
                    import urllib.parse
                    links = await page.query_selector_all('a')
                    for m in links:
                        href = await m.get_attribute('href')
                        if href and 'mailto:' in href.lower():
                            raw_email = urllib.parse.unquote(href.lower().replace('mailto:', '').split('?')[0].strip())
                            for split_e in raw_email.split(','):
                                split_e = split_e.strip()
                                if split_e and not any(x in split_e for x in generic_emails):
                                    if split_e not in results["Email"]:
                                        print(f"  [Deep Crawl]  | {'Email'.ljust(11)} | {split_e}")
                                        results["Email"].add(split_e)
                except Exception:
                    pass
                        
                # BI: Extract Meta Description or H1 for Vibe Analysis
                if pages_crawled == 1:
                    try:
                        vibe = await page.evaluate('''() => {
                            let meta = document.querySelector('meta[name="description"]');
                            if (meta && meta.content) return meta.content;
                            let h1 = document.querySelector('h1');
                            if (h1) return h1.innerText;
                            return "";
                        }''')
                        if vibe:
                            results["Meta Vibe"] = vibe.strip().replace('\n', ' ')
                    except Exception:
                        pass
                        
                # Raw regex fallback for socials hidden in JS objects or missing href tags
                social_patterns = [
                    (r'https?://(?:www\.)?instagram\.com/[a-zA-Z0-9_.-]+/?', "Instagram"),
                    (r'https?://(?:www\.)?linkedin\.com/(?:company|in)/[a-zA-Z0-9_.-]+/?', "LinkedIn"),
                    (r'https?://(?:www\.)?facebook\.com/[a-zA-Z0-9_.-]+/?', "Facebook"),
                    (r'https?://(?:www\.)?(?:twitter\.com|x\.com)/[a-zA-Z0-9_.-]+/?', "X (Twitter)"),
                    (r'https?://(?:www\.)?youtube\.com/(?:c/|channel/|user/|@)?[a-zA-Z0-9_.-]+/?', "YouTube"),
                    (r'https?://(?:www\.)?tiktok\.com/@[a-zA-Z0-9_.-]+/?', "TikTok")
                ]
                bad_socials = ['/p/', '/tr', '/sharer', '/pages/', '/share', '/videos/', '/watch', '/embed', '/s/', 'iframe_api', '/status/', '/hashtag/']
                
                def normalize_url(u):
                    return u.replace('https://','').replace('http://','').replace('www.','').rstrip('/').lower()
                
                for pattern, platform in social_patterns:
                    found_links = re.findall(pattern, html)
                    for fl in found_links:
                        if not any(bad in fl.lower() for bad in bad_socials):
                            clean_fl = fl.split('?')[0].rstrip('/')
                            if not any(normalize_url(clean_fl) == normalize_url(ex) for ex in results[platform]):
                                print(f"  [Deep Crawl]  | {platform.ljust(11)} | {clean_fl}")
                                results[platform].add(clean_fl)
                
                # Extract socials and internal links via DOM parsing
                links = await page.query_selector_all('a[href]')
                for link in links:
                    href = await link.get_attribute('href')
                    if not href:
                        continue
                    href_lower = href.lower()
                    
                    # Strict Domain Parsing for Socials
                    import urllib.parse
                    try:
                        p = urllib.parse.urlparse(href_lower)
                        domain = p.netloc.replace('www.', '')
                        
                        if domain in ['instagram.com', 'linkedin.com', 'facebook.com', 'twitter.com', 'x.com', 'youtube.com', 'youtu.be', 'tiktok.com']:
                            if not any(bad in href_lower for bad in bad_socials):
                                clean_href = href.split('?')[0].rstrip('/')
                                
                                platform = ""
                                if domain == 'instagram.com': platform = 'Instagram'
                                elif domain == 'linkedin.com': platform = 'LinkedIn'
                                elif domain == 'facebook.com': platform = 'Facebook'
                                elif domain in ['twitter.com', 'x.com']: platform = 'X (Twitter)'
                                elif domain in ['youtube.com', 'youtu.be']: platform = 'YouTube'
                                elif domain == 'tiktok.com': platform = 'TikTok'
                                
                                if platform and not any(normalize_url(clean_href) == normalize_url(ex) for ex in results[platform]):
                                    print(f"  [Deep Crawl]  | {platform.ljust(11)} | {clean_href}")
                                    results[platform].add(clean_href)
                    except Exception:
                        pass
                    
                    # BI: Extract Menu/Services URLs
                    if any(k in href_lower for k in ['/menu', '/pricing', '/services', '/catalog']):
                        results["Menu Services"].add(href)
                    
                    # Internal links for deep crawling (only from homepage)
                    elif pages_crawled == 1 and (href.startswith('/') or (domain and domain in url) or url in href):
                        full_href = urllib.parse.urljoin(url, href).split('#')[0].rstrip('/')
                        if full_href not in internal_links and not any(ext in full_href for ext in ['.pdf', '.jpg', '.png']):
                            internal_links.add(full_href)
                            # Prioritize high-value pages so they are crawled first
                            high_value_words = ['contact', 'about', 'connect', 'team', 'info', 'support', 'help', 'shipping', 'faq', 'directory', 'locations', 'reach', 'questions', 'inquiries', 'feedback', 'reservation', 'booking', 'sales', 'press', 'media', 'customer', 'service', 'assistance', 'staff', 'management']
                            if any(k in full_href.lower() for k in high_value_words):
                                to_visit.insert(0, full_href)
                            else:
                                to_visit.append(full_href)
                            
            except Exception:
                pass
    finally:
        await page.close()
        
    return format_socials(results)

def format_socials(results):
    import urllib.parse
    formatted = {}
    
    blacklist = {
        "Instagram": ["/p/", "/reel", "/explore", "/stories", "cdninstagram.com", "/share", "/create", "instagram.com/reel"],
        "Facebook": ["/tr", "/sharer", "/pages/", "/events/", "/groups/", "/post", "/posts/", "/video/", "/2008", "/2009", "/home"],
        "X (Twitter)": ["/status/", "/intent/", "/share", "/tweet"],
        "YouTube": ["/embed", "/s/", "iframe_api", "/watch"],
        "LinkedIn": ["/pulse/", "/jobs/"],
        "TikTok": ["/video/"]
    }
    
    for key, val in results.items():
        if isinstance(val, set):
            if key == "Email":
                unique_emails = list(set(e.lower() for e in val))
                formatted[key] = ", ".join(unique_emails)
            else:
                unique_urls = []
                seen_norms = set()
                for url in val:
                    url = url.replace('%20', '').strip()
                    url_lower = url.lower()
                    
                    if key in blacklist:
                        if any(b in url_lower for b in blacklist[key]):
                            continue
                            
                    if any(ext in url_lower for ext in ['.jpg', '.png', '.jpeg', '.gif', '.mp4']):
                        continue
                        
                    try:
                        p = urllib.parse.urlparse(url)
                        n = p.netloc.lower()
                        if n.startswith('www.'): n = n[4:]
                        path = p.path.rstrip('/')
                        norm = n + path
                        
                        # Reconstruct the clean URL without queries or fragments
                        clean_url = f"https://{n}{p.path}"
                        if clean_url.endswith('/'): clean_url = clean_url[:-1]
                    except Exception:
                        norm = url_lower.rstrip('/')
                        clean_url = url
                    
                    # Prevent naked domains like instagram.com/
                    parts = norm.split('/')
                    if norm not in seen_norms and len(parts) > 1 and parts[1].strip() != "":
                        seen_norms.add(norm)
                        unique_urls.append(clean_url)
                        
                formatted[key] = ", ".join(unique_urls)
        else:
            formatted[key] = val
    return formatted


async def main(search_query, locality, city, num_of_leads, end_date="", end_time=""):
    industry = clean_industry(search_query, locality, city)
    
    import datetime
    deadline = None
    if end_date and end_time:
        try:
            deadline = datetime.datetime.strptime(f"{end_date} {end_time}", "%Y-%m-%d %H:%M")
        except ValueError:
            print("Invalid date/time format for deadline. Ignored.")
            
    now = datetime.datetime.now()
    today_formatted = f"{now.month}/{now.day}/{now.strftime('%y')}"
    
    clean_loc = re.sub(r'^(in|near|at|around|on)\s+', '', locality, flags=re.IGNORECASE).title()
    
    leads = []
    
    print(f"Starting scraper for query: '{search_query} {locality} {city}'")
    print(f"Targeting: {num_of_leads} leads")
    
    # --- GOOGLE SHEETS SETUP ---
    gs_enabled = False
    try:
        import gspread

        gc = gspread.service_account(filename=SERVICE_ACCOUNT_FILE)
        sh = gc.open(SPREADSHEET_NAME)
        gs_worksheet = sh.worksheet(WORKSHEET_NAME)
        
        # Check and update headers if missing/incomplete
        try:
            current_headers = gs_worksheet.row_values(1)
        except Exception:
            current_headers = []
            
        if current_headers != COLUMNS:
            print("[INFO] Google Sheets headers missing or outdated. Generating CRM headers...")
            gs_worksheet.update(values=[COLUMNS], range_name="A1")
            
        # Format the sheet (Header Bold, Column A Left-Aligned)
        try:
            sh.batch_update({
                "requests": [
                    {
                        "repeatCell": {
                            "range": {
                                "sheetId": gs_worksheet.id,
                                "startRowIndex": 0,
                                "endRowIndex": 1,
                                "startColumnIndex": 0,
                                "endColumnIndex": len(COLUMNS)
                            },
                            "cell": {
                                "userEnteredFormat": {
                                    "textFormat": {"bold": True}
                                }
                            },
                            "fields": "userEnteredFormat.textFormat"
                        }
                    },
                    {
                        "repeatCell": {
                            "range": {
                                "sheetId": gs_worksheet.id,
                                "startRowIndex": 0,
                                "startColumnIndex": 0,
                                "endColumnIndex": 1
                            },
                            "cell": {
                                "userEnteredFormat": {
                                    "horizontalAlignment": "LEFT"
                                }
                            },
                            "fields": "userEnteredFormat.horizontalAlignment"
                        }
                    }
                ]
            })
        except Exception as e:
            print(f"[WARNING] Could not format Google Sheet: {e}")

        # Fetch historical data to find the next empty row automatically
        all_records = gs_worksheet.get_all_values()
        
        # Calculate next Client ID dynamically
        # Header is row 1. If 10 leads exist, len(all_records) is 11. 
        # Next target row is 12. Next Client ID is 11.
        client_id_start = len(all_records)
        target_row = client_id_start + 1
        # Global deduplication setup
        seen_leads = set()
        print("[INFO] Fetching historical data for deduplication...")
        if len(all_records) > 1:
            headers = all_records[0]
            try:
                name_idx = headers.index("Business Name")
                url_idx = headers.index("Maps URL")
                for row in all_records[1:]:
                    if len(row) > max(name_idx, url_idx):
                        name_clean = clean_business_name(row[name_idx])
                        url_canon = get_canonical_maps_key(row[url_idx])
                        if name_clean or url_canon:
                            seen_leads.add((name_clean, url_canon))
                print(f"[INFO] Deduplication active: Loaded {len(seen_leads)} unique historical leads.")
                
                # --- SELF-HEALING CRM SYNC ---
                try:
                    client_id_idx = headers.index("Client ID")
                    existing_ids = []
                    for row in all_records[1:]:
                        if len(row) > client_id_idx and str(row[client_id_idx]).strip().isdigit():
                            existing_ids.append(int(str(row[client_id_idx]).strip()))
                    
                    if existing_ids:
                        max_id = max(existing_ids)
                        expected_ids = set(range(1, max_id + 1))
                        missing_ids = expected_ids - set(existing_ids)
                        
                        if missing_ids:
                            print(f"[SELF-HEALING] Detected {len(missing_ids)} missing leads in Google Sheets (IDs: {sorted(list(missing_ids))[:10]}{'...' if len(missing_ids)>10 else ''}). Attempting local recovery...")
                            try:
                                local_df = pd.read_excel('google_maps_leads.xlsx')
                                
                                patched = 0
                                for mid in sorted(list(missing_ids)):
                                    matching_rows = local_df[local_df['Client ID'] == mid]
                                    if not matching_rows.empty:
                                        lead_row = matching_rows.iloc[0]
                                        row_data = lead_row.fillna('').astype(str).tolist()
                                        target_patch_row = mid + 1
                                        
                                        print(f"  -> Patching Client ID {mid} from local Excel into Google Sheets row A{target_patch_row}...")
                                        gs_worksheet.update(values=[row_data], range_name=f"A{target_patch_row}", value_input_option="RAW")
                                        time.sleep(2)  # Prevent rate limits during rapid patching
                                        patched += 1
                                    else:
                                        print(f"  -> Client ID {mid} not found in local Excel either.")
                                        
                                print(f"[SELF-HEALING] Successfully recovered {patched} missing leads back into the live CRM!")
                            except Exception as e:
                                print(f"[SELF-HEALING] Local recovery failed: {e}")
                except Exception as e:
                    print(f"[WARNING] Self-Healing Sync error: {e}")
                # -----------------------------
                
                print(f"[INFO] Auto-detected next Client ID: {client_id_start} (Target Row: {target_row})")
            except ValueError:
                print("[WARNING] Could not map columns for deduplication. Headers might be missing.")
            
        gs_enabled = True
        print(f"[INFO] Google Sheets synced successfully. Target row {target_row} is empty. Real-time uploading enabled.")
    except SystemExit:
        sys.exit(1)
    except Exception as e:
        print(f"[WARNING] Google Sheets upload disabled: {e}")
        
    
    try:
        async with async_playwright() as p:
            import os
            user_data_dir = os.path.join(os.getcwd(), 'playwright_auth')
            context = await p.chromium.launch_persistent_context(
                user_data_dir,
                headless=False,
                channel="chrome",
                args=['--window-size=1920,1080', '--disable-blink-features=AutomationControlled'],
                viewport={'width': 1920, 'height': 1080}
            )
            pages = context.pages
            page = pages[0] if pages else await context.new_page()
            await Stealth().apply_stealth_async(page)
            
            full_query = " ".join([p for p in [search_query, locality, city] if p]).strip()
            search_url = f"https://www.google.com/maps/search/{quote_plus(full_query)}"
            try:
                await page.goto(search_url, wait_until="domcontentloaded", timeout=45000)
            except Exception as nav_e:
                await page.goto(search_url, timeout=45000)
            
            # Dismiss any cookie/consent dialog if present
            try:
                consent_btn = await page.query_selector('button[aria-label*="Accept"], button:has-text("Accept all"), button:has-text("I agree")')
                if consent_btn:
                    await consent_btn.click()
                    await page.wait_for_timeout(2000)
            except Exception:
                pass
            
            feed_selectors = ['div[role="feed"]', 'div[aria-label*="Results for"]', 'div.m6QErb[aria-label]', 'div.m6QErb.DZiLbe', 'div[role="main"]']
            found_feed = False
            for sel in feed_selectors:
                try:
                    await page.wait_for_selector(sel, timeout=12000)
                    feed_selector = sel
                    found_feed = True
                    break
                except Exception:
                    continue
            
            if not found_feed:
                if await page.query_selector('h1.DUwDvf') or await page.query_selector('a[href*="google.com/maps/place/"]'):
                    feed_selector = 'div.m6QErb'
                else:
                    print("Could not find the feed container. Exiting.")
                    await context.close()
                    return
                
            scraped_urls = set()
            client_id_counter = client_id_start
            end_reached = False
            empty_scroll_count = 0
            
            while len(leads) < num_of_leads and not end_reached:
                import os
                
                if os.path.exists("pause.flag"):
                    print("\n[PAUSED] Bot paused by user. Sleeping...")
                    import time
                    while os.path.exists("pause.flag"):
                        time.sleep(5)
                    print("\n[RESUMED] Resuming extraction...")
                    
                if os.path.exists("stop_scraper.flag"):
                    print("\n[SHUTDOWN] Stop flag detected! Terminating extraction cleanly and compiling Excel...")
                    break
                    
                # First, check if the end marker is visible at the current scroll position
                # Sometimes it's loaded without scrolling much
                end_marker = await page.query_selector('span:has-text("You\'ve reached the end of the list.")')
                if end_marker and await end_marker.is_visible():
                    end_reached = True
                
                # Wait for feed to be ready (especially after coming back from a detail view)
                try:
                    await page.wait_for_selector('a[href*="https://www.google.com/maps/place/"]', timeout=3000)
                except Exception:
                    pass
                    
                cards = await page.query_selector_all('a[href*="https://www.google.com/maps/place/"]')
                
                # Fast pre-filtering to check if we have any new cards to process
                has_new_leads = False
                for card in cards:
                    try:
                        url = await card.get_attribute("href")
                        name = await card.get_attribute("aria-label")
                        if url and name:
                            new_key = (clean_business_name(name), get_canonical_maps_key(url))
                            if new_key not in seen_leads:
                                has_new_leads = True
                                break
                            else:
                                scraped_urls.add(url)
                    except Exception:
                        pass
                        
                if not has_new_leads and not end_reached:
                    print("[INFO] Scanning visible listings (all are duplicates). Scrolling down to find new leads...")
                    scroll_count = 0
                    while not has_new_leads and not end_reached and scroll_count < 10:
                        if cards:
                            try:
                                await cards[-1].hover()
                                await cards[-1].focus()
                                await page.keyboard.press("PageDown")
                                await page.keyboard.press("PageDown")
                            except Exception:
                                pass
                        await page.wait_for_timeout(1500)
                        
                        end_marker = await page.query_selector('span:has-text("You\'ve reached the end of the list.")')
                        if end_marker and await end_marker.is_visible():
                            end_reached = True
                            break
                            
                        cards = await page.query_selector_all('a[href*="https://www.google.com/maps/place/"]')
                        for card in cards:
                            try:
                                url = await card.get_attribute("href")
                                name = await card.get_attribute("aria-label")
                                if url and name:
                                    new_key = (clean_business_name(name), get_canonical_maps_key(url))
                                    if new_key not in seen_leads:
                                        has_new_leads = True
                                        break
                                    else:
                                        scraped_urls.add(url)
                            except Exception:
                                pass
                        scroll_count += 1
                    continue
                
                new_items = []
                for card in cards:
                    url = await card.get_attribute("href")
                    name = await card.get_attribute("aria-label")
                    if url and url not in scraped_urls:
                        new_items.append((name, url))
                
                if not new_items and end_reached:
                    break
                    
                if not new_items:
                    empty_scroll_count += 1
                    if empty_scroll_count > 5:
                        print("No new cards found after scrolling multiple times. Ending early.")
                        break
                    
                    # Scroll the feed container to trigger lazy loading via PageDown
                    await page.bring_to_front()
                    cards_fresh = await page.query_selector_all('a[href*="https://www.google.com/maps/place/"]')
                    if cards_fresh:
                        try:
                            await cards_fresh[-1].hover()
                            await cards_fresh[-1].focus()
                            await page.keyboard.press("PageDown")
                            await page.keyboard.press("PageDown")
                        except Exception:
                            pass
                        await page.wait_for_timeout(5000)
                    continue
    
                # Reset counter since we found cards
                empty_scroll_count = 0
    
                for name_attr, url in new_items:
                    if deadline and datetime.datetime.now() > deadline:
                        print("\n[SHUTDOWN] Deadline reached! Terminating extraction cleanly...")
                        num_of_leads = len(leads) # Force the loop to end and exit
                        break
                        
                    import os
                    if os.path.exists("target_update.txt"):
                        try:
                            with open("target_update.txt", "r") as f:
                                num_of_leads = int(f.read().strip())
                        except Exception:
                            pass
                            
                    if len(leads) >= num_of_leads:
                        break
                        
                    scraped_urls.add(url)
                    
                    safe_name_attr = name_attr.encode('ascii', 'replace').decode('ascii')
                    # Fast Deduplication Check (Name + Maps URL)
                    new_key = (clean_business_name(name_attr), get_canonical_maps_key(url))
                    if new_key in seen_leads:
                        print(f"[SKIP] Duplicate detected: '{safe_name_attr}'. Already in database. Skipping...")
                        continue
                        
                    seen_leads.add(new_key)
                    
                    # Write live status to file for Telegram Bot
                    try:
                        import json
                        with open("status.json", "w") as f:
                            json.dump({
                                "current_lead": safe_name_attr,
                                "leads_extracted": len(leads),
                                "target": num_of_leads
                            }, f)
                    except Exception:
                        pass
                    
                    print(f"\n=======================================================")
                    print(f"[{len(leads) + 1}/{num_of_leads}] ANALYZING LEAD: {safe_name_attr}")
                    print(f"=======================================================")
                    
                    # Open details in a new tab to preserve the search list state perfectly
                    detail_page = await context.new_page()
                    print(f"  [System] Loading Google Maps listing (this may take a few seconds)...")
                    try:
                        try:
                            await detail_page.goto(url, timeout=PAGE_TIMEOUT, wait_until="domcontentloaded")
                        except Exception:
                            print(f"[WARNING] Slow load for '{name_attr}', attempting extraction anyway...")
                            
                        try:
                            await detail_page.wait_for_selector('h1', timeout=ELEM_TIMEOUT)
                            await detail_page.wait_for_timeout(5000)
                            
                            name = name_attr
                            if not name:
                                name_elem = await detail_page.query_selector('h1.DUwDvf')
                                if name_elem:
                                    name = await name_elem.inner_text()
                                else:
                                    name_elem = await detail_page.query_selector('h1')
                                    if name_elem:
                                        name = await name_elem.inner_text()
                                        
                            safe_name = name.encode('ascii', 'replace').decode('ascii')
                            print(f"\n  [Google Maps] | {'Name'.ljust(11)} | {safe_name}")
                                
                            website = ""
                            phones = []
                            phone_elems = await detail_page.query_selector_all('button[data-item-id^="phone:tel:"]')
                            for pe in phone_elems:
                                phone_attr = await pe.get_attribute('data-item-id')
                                if phone_attr:
                                    p_num = phone_attr.replace('phone:tel:', '').strip()
                                    clean_p = extract_phone_from_url_or_text(p_num) or p_num
                                    if clean_p and clean_p not in phones:
                                        phones.append(clean_p)
                            
                            # Deep Extraction Trick 1: Extract from initial website/WA link
                            if website:
                                extracted_wa_phone = extract_phone_from_url_or_text(website)
                                if extracted_wa_phone and extracted_wa_phone not in phones:
                                    phones.append(extracted_wa_phone)
                                    print(f"  [Google Maps] | {'Phone (WA Link)'.ljust(11)} | {extracted_wa_phone}")

                            phone = " / ".join(phones)
                            print(f"  [Google Maps] | {'Phone'.ljust(11)} | {phone if phone else 'Not Found'}")
                            
                            website = ""
                            # MAXIMUM SECURITY WEBSITE EXTRACTION: 3-loop polling over ~4.5 seconds to bypass React hydration
                            for _ in range(3):
                                try:
                                    # Trick 1: Playwright Native Wait (hooks into rendering engine)
                                    try:
                                        w_elem = await detail_page.wait_for_selector('a[data-item-id="authority"]', timeout=1500)
                                        if w_elem:
                                            href = await w_elem.get_attribute('href')
                                            if href and "google.com" not in href:
                                                website = href
                                                break
                                    except Exception:
                                        pass
                                        
                                    # Trick 2: Javascript DOM Extraction (searches memory instantly)
                                    if not website:
                                        website = await detail_page.evaluate('''() => {
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
                                            w_text = await detail_page.query_selector('a:has-text("Website"), a:has-text("website.com"), a[href^="http"]:not([href*="google.com"])')
                                            if w_text:
                                                href = await w_text.get_attribute('href')
                                                if href and "google.com" not in href:
                                                    website = href
                                                    break
                                        except Exception:
                                            pass
                                    
                                except Exception:
                                    pass
                                
                                # If not found, wait 1 second for React to paint and retry
                                await detail_page.wait_for_timeout(1000)
                                
                            print(f"  [Google Maps] | {'Website'.ljust(11)} | {website if website else 'Not Found'}")
                            
                            is_blacklisted = False
                            is_of_interest = False
                            if website:
                                wl = website.lower()
                                if any(dom in wl for dom in INTEREST_URLS):
                                    is_of_interest = True
                                    is_blacklisted = True
                                else:
                                    for bl in BLACKLISTED_URLS:
                                        if bl in wl:
                                            is_blacklisted = True
                                            break
                                        
                            if website and not is_blacklisted:
                                print(f"  [SKIP] Found valid website ({website}). Hunting for No-Website leads only. Skipping.")
                                continue
                            elif is_blacklisted:
                                if is_of_interest:
                                    print(f"  [Google Maps] | {'Website'.ljust(11)} | Website of Interest ({website}). NOT skipping.")
                                else:
                                    print(f"  [Google Maps] | {'Website'.ljust(11)} | Blacklisted domain ({website}). Treating as NO-WEBSITE.")
                                    website = ""

                            # Deep Extraction Trick 2: Check website link & anchor tags for additional numbers
                            if website:
                                extracted_wa_phone = extract_phone_from_url_or_text(website)
                                if extracted_wa_phone and extracted_wa_phone not in phones:
                                    phones.append(extracted_wa_phone)
                                    phone = " / ".join(phones)
                                    print(f"  [Google Maps] | {'Phone (WA/Web)'.ljust(11)} | {extracted_wa_phone}")

                            # Extract socials directly from Maps DOM early to apply early-skip check
                            maps_socials = {
                                "Facebook": set(), "Instagram": set(), "LinkedIn": set(),
                                "X (Twitter)": set(), "YouTube": set(), "TikTok": set(),
                            }
                            maps_links = await detail_page.query_selector_all('a[href]')
                            for link in maps_links:
                                href = await link.get_attribute('href')
                                if href:
                                    hl = href.lower()
                                    if 'facebook.com' in hl: maps_socials["Facebook"].add(href)
                                    elif 'instagram.com' in hl: maps_socials["Instagram"].add(href)
                                    elif 'linkedin.com' in hl: maps_socials["LinkedIn"].add(href)
                                    elif 'twitter.com' in hl or 'x.com' in hl: maps_socials["X (Twitter)"].add(href)
                                    elif 'youtube.com' in hl: maps_socials["YouTube"].add(href)
                                    elif 'tiktok.com' in hl: maps_socials["TikTok"].add(href)

                            # Deep Extraction Trick 3: Check all links and page text for phone / WA links
                            for link in maps_links:
                                href = await link.get_attribute('href') or ""
                                text = await link.inner_text() or ""
                                extracted = extract_phone_from_url_or_text(href) or extract_phone_from_url_or_text(text)
                                if extracted and extracted not in phones:
                                    phones.append(extracted)
                                    phone = " / ".join(phones)
                                    print(f"  [Google Maps] | {'Phone (Page Link)'.ljust(11)} | {extracted}")
                                    
                            if len(phones) == 0:
                                # Quick regex check on full page text for Indian phone
                                try:
                                    page_body_text = await detail_page.evaluate("() => document.body.innerText")
                                    body_phone = extract_phone_from_url_or_text(page_body_text[:3000])
                                    if body_phone and body_phone not in phones:
                                        phones.append(body_phone)
                                        phone = " / ".join(phones)
                                        print(f"  [Google Maps] | {'Phone (Page Text)'.ljust(11)} | {body_phone}")
                                except Exception:
                                    pass

                            has_phone = bool(phone.strip())
                            has_socials = any(len(maps_socials[social]) > 0 for social in ["Instagram", "Facebook", "LinkedIn", "X (Twitter)", "YouTube", "TikTok"])

                            if not (has_phone or has_socials or is_of_interest):
                                print(f"  [SKIP] '{safe_name}' has no phone number or socials. Skipping lead (early check).")
                                continue
                                    
                            # Extract Ratings and Reviews
                            rating = ""
                            num_reviews = ""
                            rating_elem = await detail_page.query_selector('div.F7nice span[aria-hidden="true"]')
                            if rating_elem:
                                rating = await rating_elem.inner_text()
                                
                            reviews_elem = await detail_page.query_selector('div.F7nice span[aria-label*="reviews"]')
                            if reviews_elem:
                                num_reviews_text = await reviews_elem.get_attribute('aria-label')
                                if num_reviews_text:
                                    num_reviews = num_reviews_text.replace("reviews", "").replace("review", "").replace("(", "").replace(")", "").strip()
                                    
                            print(f"  [Google Maps] | {'Rating'.ljust(11)} | {rating} ({num_reviews} Reviews)")
                                    
                            # --- EXTRACT REVIEWS & GENERATE LLM SUMMARY ---
                            # SKIPPED: The no_website hunter disables deep review extraction and LLM Hooks 
                            # to maximize extraction speed. We just want to find leads to pitch websites to!
                            overview_text = ""
                            ai_outreach_hook = ""
                                    
                            # Extract Day-Wise Timings
                            timings = ""
                            try:
                                # INVISIBLE MAGIC: Forcefully click the dropdown natively in Javascript memory 
                                # to bypass Google Maps removing targetable CSS classes and aria-labels
                                await detail_page.evaluate('''() => {
                                    let clickables = document.querySelectorAll('[aria-expanded="false"]');
                                    for (let el of clickables) {
                                        let txt = el.textContent || "";
                                        let aria = el.getAttribute('aria-label') || "";
                                        if (txt.includes('Open') || txt.includes('Closed') || txt.includes('Hours') || aria.includes('Hours') || aria.includes('Open') || aria.includes('Closed')) {
                                            el.click(); // Trigger native DOM click event
                                        }
                                    }
                                }''')
                                # Wait dynamically for the schedule table to render (max 1.2s, check every 100ms)
                                for _ in range(12):
                                    table = await detail_page.query_selector('table.eKPi5e, table[class*="schedule"]')
                                    if table:
                                        break
                                    await detail_page.wait_for_timeout(100)
                                    
                                # Extract table
                                table = await detail_page.query_selector('table.eKPi5e, table[class*="schedule"]')
                                if not table:
                                    # Prevent it from accidentally grabbing the review ratings table
                                    table = await detail_page.query_selector('table:has-text("Mon")')
                                    if not table:
                                        table = await detail_page.query_selector('table:has-text("Tue")')
                                    
                                if table:
                                    rows = await table.query_selector_all('tr')
                                    timing_list = []
                                    for r in rows:
                                        cols = await r.query_selector_all('td')
                                        if len(cols) >= 2:
                                            day = await cols[0].inner_text()
                                            hours = await cols[1].inner_text()
                                            day = day.replace('\u200f', '').replace('\u200e', '').strip()
                                            hours = hours.replace('\u200f', '').replace('\u200e', '').replace('\n', ', ').strip()
                                            timing_list.append(f"{day}: {hours}")
                                    if timing_list:
                                        timings = " | ".join(timing_list)
                            except Exception:
                                pass
                                
                            # Ultimate JavaScript Fallback if table fails (Bypasses all Playwright selector quirks)
                            if not timings:
                                try:
                                    timings = await detail_page.evaluate('''() => {
                                        // 1. Try to extract the HTML table directly (ignores CSS visibility)
                                        let tables = document.querySelectorAll('table');
                                        for (let t of tables) {
                                            let text = t.textContent || "";
                                            if (text.includes('Monday') || text.includes('Mon') || text.includes('Tuesday') || text.includes('Tue')) {
                                                let rows = t.querySelectorAll('tr');
                                                let timingList = [];
                                                for (let r of rows) {
                                                    let cols = r.querySelectorAll('td');
                                                    if (cols.length >= 2) {
                                                        let day = cols[0].textContent.replace(/\\u200f|\\u200e/g, '').trim();
                                                        let hours = cols[1].textContent.replace(/\\u200f|\\u200e/g, '').trim();
                                                        timingList.push(day + ': ' + hours);
                                                    }
                                                }
                                                if (timingList.length > 0) return timingList.join(' | ');
                                            }
                                        }
                                        
                                        // 2. Try the aria-label string wrapper
                                        let elems = document.querySelectorAll('[aria-label]');
                                        for (let e of elems) {
                                            let lbl = e.getAttribute('aria-label');
                                            if (lbl && (lbl.includes('Monday,') || lbl.includes('Sunday,') || lbl.includes('Friday,'))) {
                                                if (lbl.includes('AM') || lbl.includes('PM') || lbl.includes('Closed') || lbl.includes('Open')) {
                                                    return lbl;
                                                }
                                            }
                                        }
                                        
                                            if (txt.includes('Mon') || txt.includes('Sun') || txt.includes('24 hours')) {
                                                return txt.trim();
                                            }
                                        }
                                        
                                        // 4. ULTIMATE FALLBACK: Grab the current day's Open/Close status if the full table is blocked
                                        let simpleElems = document.querySelectorAll('div, span');
                                        for (let e of simpleElems) {
                                            let txt = e.textContent || "";
                                            if ((txt.includes('Opens ') || txt.includes('Closes ')) && (txt.includes('AM') || txt.includes('PM') || txt.includes('am') || txt.includes('pm'))) {
                                                if (txt.length > 5 && txt.length < 50) return "Summarised_time: " + txt.trim();
                                            }
                                        }
                                        
                                        return "";
                                    }''')
                                except Exception:
                                    pass
                            
                            if timings:
                                timings = timings.replace('\n', ', ').strip()
                                
                            try:
                                safe_print = timings.encode('ascii', 'replace').decode('ascii')
                                print(f"  [Google Maps] | {'Timings'.ljust(11)} | {safe_print[:100]}..." if len(safe_print)>100 else f"  [Google Maps] | {'Timings'.ljust(11)} | {safe_print}")
                            except Exception:
                                pass
                                
                            # Website has already been extracted earlier to apply early-skip logic.
                                
                            address = ""
                            try:
                                # Use wait_for_selector to give React UI time to paint
                                addr_elem = await detail_page.wait_for_selector('[data-item-id="address"]', timeout=3000)
                                if addr_elem:
                                    address = (await addr_elem.inner_text()).strip()
                                    address = address.encode('ascii', 'ignore').decode('ascii').strip().lstrip(', ')
                            except Exception:
                                pass
                                
                            if not address:
                                try:
                                    fallback = await detail_page.query_selector('button[aria-label*="Address"]')
                                    if fallback:
                                        address = await fallback.get_attribute('aria-label')
                                        if address:
                                            address = address.replace("Address: ", "").encode('ascii', 'ignore').decode('ascii').strip().lstrip(', ')
                                except Exception:
                                    pass
                            print(f"  [Google Maps] | {'Address'.ljust(11)} | {address}")
                                
                            # Extract City and State dynamically from physical US Address
                            loc_found = ""
                            city_found = city.title().strip()
                            state_found = "State"
                            country_found = clean_loc
                            if address:
                                is_robust = False
                                try:
                                    # Standard US Format: City, ST Zip
                                    match = re.search(r'([\s\S]*?),\s*([A-Za-z\s]+),\s*([A-Z]{2})\s+\d{5}', address)
                                    if match:
                                        loc_found = match.group(1).strip()
                                        city_found = match.group(2).strip()
                                        state_found = match.group(3).strip()
                                        country_found = "United States"
                                        is_robust = True
                                    else:
                                        # Indian Address Parser: ..., City, State PINCODE (optionally with India)
                                        parts = [p.strip() for p in address.split(',')]
                                        if len(parts) >= 2:
                                            if parts[-1].lower() in ["india", "ind"]:
                                                parts.pop()
                                            if len(parts) >= 2:
                                                last_part = parts[-1]
                                                pin_match = re.search(r'\b\d{6}\b', last_part)
                                                if pin_match:
                                                    pin = pin_match.group(0)
                                                    state_found = last_part.replace(pin, '').strip().strip('-').strip()
                                                    city_found = parts[-2]
                                                    loc_found = parts[-3] if len(parts) >= 3 else ""
                                                    country_found = "India"
                                                    is_robust = True
                                        
                                        # Standard US Fallback
                                        if not is_robust:
                                            parts = [p.strip() for p in address.split(',')]
                                            if len(parts) >= 4 and any(us in address.lower() for us in ['united states', 'usa', ' us']):
                                                city_found = parts[-3]
                                                state_found = parts[-2]
                                                country_found = parts[-1]
                                                loc_found = parts[-4] if len(parts) >= 4 else ""
                                                if len(state_found) <= 4:
                                                    is_robust = True
                                except Exception:
                                    pass
                                
                                if not is_robust:
                                    print("      [LLM Fallback] Standard parsing tripped. Engaging global OpenRouter cascade...")
                                    loc_found, city_found, state_found, country_found = await extract_city_state_llm(address)
                                        
                            # Construct the dynamic City/State/Locality string
                            if city_found == "Failed to extract":
                                city_state_loc = address if address else "Unknown"
                            else:
                                # Format: Locality/City/State/Country
                                components = [loc_found, city_found, state_found, country_found]
                                city_state_loc = "/".join([c for c in components if c])
                                
                            if os.path.exists("stop_scraper.flag"):
                                print("\n[SHUTDOWN] Stop flag detected! Cancelling deep website crawl...")
                                break
                                
                            if is_of_interest:
                                # Do not crawl the staging/free website of interest, just use socials from Maps
                                website_data = await crawl_website("", context, maps_socials)
                            else:
                                website_data = await crawl_website(website, context, maps_socials)
                            
                            # Priority Level is strictly reserved for a secondary AI research agent.
                            # Do not populate.
                            lead_row = {col: "" for col in COLUMNS}
                            lead_row["Client ID"] = client_id_counter
                            lead_row["Date Added"] = today_formatted
                            lead_row["Business Name"] = name
                            lead_row["Industry/Niche"] = industry
                            lead_row["City/State"] = city_state_loc
                            lead_row["Phone/WhatsApp"] = phone
                            lead_row["Website URL"] = website
                            lead_row["Email"] = website_data["Email"]
                            lead_row["Instagram"] = website_data["Instagram"]
                            lead_row["LinkedIn"] = website_data["LinkedIn"]
                            lead_row["Facebook"] = website_data["Facebook"]
                            lead_row["X (Twitter)"] = website_data["X (Twitter)"]
                            lead_row["YouTube"] = website_data["YouTube"]
                            lead_row["TikTok"] = website_data["TikTok"]
                            lead_row["Ratings"] = rating
                            lead_row["Number Of Reviews"] = num_reviews
                            lead_row["Timings"] = timings
                            lead_row["Address"] = address.replace('\n', ', ') if address else ""
                            lead_row["Maps URL"] = url
                            lead_row["AI Outreach Hook"] = ai_outreach_hook if 'ai_outreach_hook' in locals() else ""
                            
                            # BI Columns (Priority Level, Interested Services, Notes) are reserved for a secondary AI.
                            # They will remain blank in this pipeline, unless it is a website of interest.
                            if is_of_interest:
                                lead_row["Notes"] = "website_of_interest"
                                
                            # Root Website URL
                            import urllib.parse
                            root_web = ""
                            if website:
                                try:
                                    wp = urllib.parse.urlparse(website)
                                    root_web = f"{wp.scheme}://{wp.netloc}/"
                                except Exception:
                                    root_web = website
                            lead_row["Website URL"] = root_web
                            
                            # Check if the lead has a phone number or any socials
                            has_phone = bool(lead_row.get("Phone/WhatsApp", "").strip())
                            has_socials = any(bool(lead_row.get(social, "").strip()) for social in ["Instagram", "Facebook", "LinkedIn", "X (Twitter)", "YouTube", "TikTok"])
                            
                            if not (has_phone or has_socials or is_of_interest):
                                print(f"  [SKIP] '{safe_name}' has no phone number or socials. Skipping lead.")
                                continue
                                
                            leads.append(lead_row)
                            import json
                            print(f"\n[DATA EXTRACTED] --------------------------------------")
                            print(json.dumps(lead_row, indent=4))
                            print(f"-------------------------------------------------------\n")
                            safe_name_success = name.encode('ascii', 'replace').decode('ascii')
                            print(f"[SUCCESS] Client ID #{client_id_counter}: '{safe_name_success}' parsed completely.")
                            
                            if gs_enabled:
                                cleaned_lead_row = await clean_lead_with_llm(lead_row)
                                for attempt in range(GSPREAD_RETRIES):
                                    try:
                                        row_data = [cleaned_lead_row.get(col, "") for col in COLUMNS]
                                        target_row = client_id_counter + 1
                                        gs_worksheet.update(values=[row_data], range_name=f"A{target_row}", value_input_option="RAW")
                                        try:
                                            stream_payload = json.dumps({
                                                "clientId": client_id_counter,
                                                "businessName": cleaned_lead_row.get("Business Name", ""),
                                                "phone": cleaned_lead_row.get("Phone/WhatsApp") or cleaned_lead_row.get("Phone", ""),
                                                "whatsapp": cleaned_lead_row.get("Phone/WhatsApp") or cleaned_lead_row.get("WhatsApp", ""),
                                                "website": cleaned_lead_row.get("Website URL", ""),
                                                "rating": cleaned_lead_row.get("Ratings") or cleaned_lead_row.get("Rating", ""),
                                                "reviews": cleaned_lead_row.get("Number Of Reviews") or cleaned_lead_row.get("Total Reviews", ""),
                                                "address": cleaned_lead_row.get("Address") or cleaned_lead_row.get("Full Address", "")
                                            })
                                            print(f"[STREAM_LEAD]: {stream_payload}", flush=True)
                                        except Exception as stream_e:
                                            pass
                                        break
                                    except Exception as e:
                                        if attempt == 4:
                                            print(f"[ERROR] Failed to sync Client ID #{client_id_counter} to Google Sheets after 5 attempts: {e}")
                                        else:
                                            print(f"[WARNING] Google Sheets sync failed for Client ID #{client_id_counter}. Retrying... ({e})")

                                            time.sleep(10 * (attempt + 1))
                                            try:
                                                # Force re-authentication to build a brand new HTTP session if connection was forcibly closed
                                                import gspread
                                                gc = gspread.service_account(filename=SERVICE_ACCOUNT_FILE)
                                                sh = gc.open(SPREADSHEET_NAME)
                                                gs_worksheet = sh.worksheet(WORKSHEET_NAME)
                                            except Exception as auth_e:
                                                print(f"  [WARNING] Could not re-authenticate gspread: {auth_e}")
                                            

                            
                            client_id_counter += 1
                            
                        except Exception as e:
                            print(f"Error extracting detail for card: {e}")
                            pass
                    finally:
                        await detail_page.close()
                        # Pacing sleep to avoid hitting Gemini's RPM/burst rate limits (15 RPM)
                        await asyncio.sleep(4)
                # Scroll the feed container for the next batch via scrollIntoView
                await page.bring_to_front()
                cards_fresh = await page.query_selector_all('a[href*="https://www.google.com/maps/place/"]')
                if cards_fresh:
                    try:
                        await cards_fresh[-1].hover()
                        await cards_fresh[-1].focus()
                        await page.keyboard.press("PageDown")
                        await page.keyboard.press("PageDown")
                    except Exception:
                        pass
                    await page.wait_for_timeout(3000)
                    
            await context.close()
            
    except Exception as e:
        print(f"\n[FATAL ERROR] Playwright/Scraper encountered a critical crash: {e}")
        print("[RECOVERY] Bypassing crash to forcefully save extracted data to local Excel...")
    # Save to Excel
    try:
        df = pd.DataFrame(leads, columns=COLUMNS)
        if os.path.exists('google_maps_leads.xlsx'):
            try:
                existing_df = pd.read_excel('google_maps_leads.xlsx')
                df = pd.concat([existing_df, df], ignore_index=True)
            except Exception:
                pass
        df.to_excel('google_maps_leads.xlsx', index=False)
    except Exception as e:
        print(f"[ERROR] Could not save to Excel: {e}")
        
    # --- AUTO ADJUST COLUMN WIDTHS ---
    try:
        from openpyxl import load_workbook
        from openpyxl.utils import get_column_letter
        
        wb = load_workbook('google_maps_leads.xlsx')
        ws = wb.active
        for col in ws.columns:
            max_length = 0
            column = col[0].column_letter
            for cell in col:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = (max_length + 2)
            ws.column_dimensions[column].width = adjusted_width
            
        wb.save('google_maps_leads.xlsx')
    except Exception as e:
        print(f"Could not autofit columns: {e}")
    
    if len(leads) < num_of_leads:
        print(f"\nTarget requested: {num_of_leads} | Actual leads fetched: {len(leads)} due to location boundary exhaustion. File safely saved.")
    else:
        print(f"\nTarget requested: {num_of_leads} | Actual leads fetched: {len(leads)}. Target reached. File safely saved.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Google Maps Leads Scraper")
    parser.add_argument("--query", type=str, default="restaurants", help="Search query (e.g., 'restaurants')")
    parser.add_argument("--locality", type=str, default="in USA", help="Locality/Area (e.g., 'in USA')")
    parser.add_argument("--city", type=str, default="Los Angeles", help="City or specific location")
    parser.add_argument("--leads", type=int, default=1500, help="Number of leads to extract")
    parser.add_argument("--end_date", type=str, default="", help="Optional end date (YYYY-MM-DD)")
    parser.add_argument("--end_time", type=str, default="", help="Optional end time (HH:MM) 24h format")
    
    args = parser.parse_args()
    asyncio.run(main(args.query, args.locality, args.city, args.leads, args.end_date, args.end_time))
