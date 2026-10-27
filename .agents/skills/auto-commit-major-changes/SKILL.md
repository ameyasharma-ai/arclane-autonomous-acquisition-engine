---
name: auto-commit-major-changes
description: Automatically commits and pushes all major changes across the Arclane Engine repository and the nested web-dev-agency repository to origin main with clear, descriptive commit messages.
---

# Auto Commit Major Changes Skill

This skill defines the automated, fail-safe protocol for staging, committing, and pushing code, configurations, templates, or documentation whenever a major modification or feature task is completed.

---

## 1. When to Trigger

Activate this skill automatically:
- After completing any major feature, bug fix, prompt update, or UI overhaul.
- After creating or modifying key artifacts, templates, or offers (e.g., `OUTREACH_OFFERS_INDIA.md`, `SKILL.md`).
- Before finishing a turn when file modifications remain uncommitted.
- Whenever the user explicitly asks to commit, push, or save progress.

---

## 2. Automated Dual-Repository Sync Script

The engine maintains two Git repositories:
1. **Parent Repository (`arclane-autonomous-acquisition-engine`)**: Core scraper, builder, LLM pipelines, server, and dashboard.
2. **Agency Sub-Repository (`web-dev-agency`)**: Next.js multi-tenant agency site hosting dynamic client subdomains.

Run the automated dispatcher script:

```powershell
node scripts/auto_commit.js "feat/fix: concise descriptive message"
```

If no message is passed, it intelligently inspects changed files and generates a formatted message (e.g., `chore(auto): commit major changes in ...`).

---

## 3. Manual Step-by-Step CLI Execution (PowerShell Compatible)

If executing directly via CLI, always run in PowerShell without bash syntax (do **not** use `&&` statement separators):

### Step A: Verify Working Tree Status
```powershell
git status --short
cd web-dev-agency; git status --short; cd ..
```

### Step B: Commit & Push Parent Repository
```powershell
git add -A
git commit -m "feat/fix: descriptive summary of change"
git push origin main
```

### Step C: Commit & Push Web-Dev-Agency (if modified)
```powershell
cd web-dev-agency
git add -A
git commit -m "feat/fix: descriptive summary of change"
git push origin main
cd ..
```

---

## 4. Safety Guardrails & Secrets Protection
- **Never commit `.env` files**: Ensure `.env` and API credentials (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `VERCEL_TOKEN`) remain untracked in `.gitignore`.
- **Never force push**: Never use `--force` or `-f` against `main`.
- **Verify Syntax First**: Always run `node --check` or the `syntax-and-runtime-watchdog` skill before committing code files to prevent broken builds on remote deployments.
