# ArcLane Repository Rules & Workspace Constraints

## 1. Ephemeral One-Time Scripts Protocol & Mandatory Cleanup
- **Strict Prohibition on Polluting `scripts/`**: Never create one-time fix, repair, patch, test, or migration scripts inside the repository's `scripts/` folder. The `scripts/` directory is reserved strictly for permanent, reusable production tools (e.g. `auto_commit.js`, `audit_codebase_hygiene.js`, `export_full_crm.js`).
- **Sanctioned Scratch Location**: Any temporary scripts or exploratory code required during a session MUST be stored in the external session scratch directory:
  `<appDataDir>/brain/<conversation-id>/scratch/`
  or executed inline via `node -e "..."`.
- **Mandatory Safe Deletion After Usage**: Immediately after running a one-off script and validating the outcome, the script file MUST be safely purged from disk (`Remove-Item` / `rm`).
- **Pre-Commit Verification**: Never stage or commit one-off scratch scripts to Git. Always verify `git status` before triggering `node scripts/auto_commit.js`.

## 2. Core Assets & Repository Protection
- **Protected Core Directories**: Never delete, rename, or truncate files in `src/`, `web-dev-agency/public/sites/`, `data_exports/crm_leads_latest.json`, or `.env`.
- **Dual-Repo Synchronization**: Always use `node scripts/auto_commit.js "<message>"` when committing codebase updates so both the Arclane Engine and the nested `web-dev-agency` submodule repository remain in sync on `origin main`.
- **Clean Mobile & Fluid UI Standards**: Never hardcode arbitrary `max-w-[...]` clamps on brand titles or inject `pb-*` onto `<body>`. Mobile clearance must live internal to `<footer>`.
