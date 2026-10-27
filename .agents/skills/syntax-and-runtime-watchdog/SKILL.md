---
name: syntax-and-runtime-watchdog
description: Comprehensive verification procedure and automated watchdog for catching and fixing JavaScript/Node syntax errors, Telegram API 400 chat errors, dual-boot clock drift, and Windows path issues across the Arclane engine.
---

# Syntax & Runtime Watchdog Skill

This skill defines the mandatory protocol for verifying, diagnosing, and fixing code syntax and runtime errors before and after any edits to the Arclane Autonomous Acquisition Engine.

---

## 1. Automated Syntax & Compilation Verification

Before finishing any task or starting background tasks, run syntax checking across all modified JavaScript and Python files:

```powershell
# 1. Check syntax of all core Node.js files without executing them
node --check src/web_ui.js src/sheets.js src/agency_publisher.js src/builder.js controller_bot/index.js controller_bot/pipeline_runner.js controller_bot/scheduler.js controller_bot/scraper_runner.js

# 2. Check ESM module resolution and import validity
node -e "Promise.all([import('./src/web_ui.js'), import('./src/sheets.js'), import('./src/agency_publisher.js'), import('./src/builder.js')]).then(() => console.log('✅ All core modules import cleanly')).catch(e => { console.error('❌ Import failed:', e); process.exit(1); })"
```

If any `SyntaxError` (such as `missing ) after argument list`, `Unexpected token`, or missing braces) is detected, inspect the line number immediately using `view_file` around the reported line and fix the enclosing block.

---

## 2. Preventing Telegram `400: Bad Request: chat not found`

### Root Cause
When commands are triggered from the Local Web Dashboard (`http://localhost:3001`), the incoming context contains a mock chat ID (`local-web-ui` or `web_ui_user`). Calling `bot.telegram.sendMessage('local-web-ui', ...)` causes Telegraf to send this ID to Telegram's API, which returns `400: Bad Request: chat not found`.

### Standard Guard Pattern
Every component that broadcasts notifications (such as `WebsiteBuilder.sendStatus`, `PipelineRunner.sendTelegram`, and `ScraperRunner.sendTelegram`) MUST adhere to this pattern:

```javascript
// 1. Broadcast to Local Web UI & Socket.io (Always active)
import('./web_ui.js').then(({ webUI }) => webUI.broadcast(msg)).catch(()=>{});

// 2. Only send to Telegram if it's a genuine numerical Telegram chat ID
if (this.telegramBot && this.chatId && this.chatId !== 'local-web-ui' && this.chatId !== 'web_ui_user') {
    try {
        await this.telegramBot.telegram.sendMessage(this.chatId, msg, { parse_mode: 'Markdown' });
    } catch (e) {
        try {
            await this.telegramBot.telegram.sendMessage(this.chatId, msg);
        } catch (err) {
            if (!err.message.includes('chat not found')) {
                console.error("Telegram notification error:", err.message);
            }
        }
    }
}
```

In `Scheduler.setChatId(chatId)`:
```javascript
setChatId(chatId) {
    if (!chatId || chatId === 'local-web-ui' || chatId === 'web_ui_user') {
        return; // Preserve existing real Telegram chatId if available
    }
    this.chatId = chatId;
    this.scraperRunner.chatId = chatId;
    this.pipelineRunner.chatId = chatId;
}
```

---

## 3. Resolving Python & Playwright Executable Path on Windows

### Root Cause
`spawn('python')` on Windows may point to the Microsoft Store redirector (`C:\Users\<User>\AppData\Local\Microsoft\WindowsApps\python.exe`) which does not have Playwright installed.

### Solution Pattern
In `controller_bot/scraper_runner.js`:
```javascript
const candidatePythons = [
    'C:\\Users\\Ameya Sharma\\anaconda3\\python.exe',
    'python'
];
```
Always verify Playwright is installed:
```powershell
& "C:\Users\Ameya Sharma\anaconda3\python.exe" -m playwright --version
```

---

## 4. Google API JWT Clock Drift Handling

### Root Cause
Dual-boot systems (Windows & Linux) often introduce clock offsets against UTC (~5.5 hours), producing `invalid_grant: Invalid JWT timeframe`.

### Standard Solution Pattern
In `src/sheets.js` and `scraper/scraper_no_website.py`, do NOT adjust the motherboard hardware clock. Instead, synchronize against Google's HTTP server date header:
```javascript
const headRes = await fetch('https://www.googleapis.com', { method: 'HEAD' });
const dateHeader = headRes.headers.get('date');
if (dateHeader) {
    const serverMs = new Date(dateHeader).getTime();
    const localMs = Date.now();
    clockDriftMs = serverMs - localMs;
}
```
Wrap `global.Date.now()` during JWT signing to adjust for `clockDriftMs`.
