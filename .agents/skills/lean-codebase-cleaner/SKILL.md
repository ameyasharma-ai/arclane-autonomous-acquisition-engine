---
name: lean-codebase-cleaner
description: Audits the repository for temporary test artifacts, scratch scripts, browser shader caches, and obsolete files to suggest and execute safe deletions, keeping the codebase lean and fast.
---

# Lean Codebase Cleaner Skill

This skill provides an automated, fail-safe protocol to audit, identify, and safely purge temporary scratch files, visual test captures, browser shader caches, and stale logs without ever touching production engines, active client sites, or CRM lead databases.

---

## 1. When to Trigger

Activate this skill:
- When the user asks to clean the repository, prune files, or keep the codebase lean.
- After running heavy Playwright test suites, visual debugging sessions, or crawl sessions that generate temporary captures and scratch scripts.
- Prior to major commits or releases to prevent committing transient files.
- Periodically to reclaim disk space from Chromium cache accumulations (`chrome_profile/GPUCache`, `ShaderCache`).

---

## 2. Safety Tiers

| Tier | Category | Safety Level | Example Targets |
| :--- | :--- | :--- | :--- |
| **🟢 Tier 1** | **Temporary Bloat** | **100% Safe to Delete Immediately** | `scratch/*`, root `crop_*.png`, `test_*.png`, `chrome_profile/Default/GPUCache`, `ShaderCache`, `GrShaderCache` |
| **🟡 Tier 2** | **Stale Runtime Artifacts** | **Safe to Prune with User Confirmation** | Archival logs in `logs/*.log` (except `active.log`), empty directories in `reports/` |
| **🔴 Tier 3** | **Protected Assets** | **NEVER TOUCH / DO NOT DELETE** | `src/` core engines, `web-dev-agency/public/sites/`, `data_exports/crm_leads_latest.json`, `.env`, API keys |

---

## 3. How to Run the Audit

### Step A: Non-Destructive Audit (Report Only)
Execute the audit script to inspect bloat and view exact file paths, sizes, and reasons:

```powershell
node scripts/audit_codebase_hygiene.js
```

### Step B: Safe Cleanup Execution
When confirmed or requested to clean up, run with the `--clean` flag:

```powershell
node scripts/audit_codebase_hygiene.js --clean
```

This immediately purges Tier 1 scratch files and browser shader caches while keeping all Tier 2 and Tier 3 files completely intact.

---

## 4. Verification Protocol
After running the cleanup:
1. Run `git status` to verify no tracked or core engine files were deleted.
2. Confirm recovered disk space in the terminal output.
3. If Git status reports untracked files that should be permanently deleted, verify them against Tier 1 rules before removing.
