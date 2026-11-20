# Rule: Ephemeral One-Time Scripts Protocol & Safe Cleanup

## Scope & Applicability
This rule applies whenever an agent creates, runs, or manages temporary, single-use, diagnostic, migration, or repair scripts in this workspace.

## Core Directives

1. **Zero-Pollution in `scripts/`**:
   - The repository's `scripts/` directory is reserved solely for permanent, production CLI tools (`auto_commit.js`, `audit_codebase_hygiene.js`, `export_full_crm.js`, `deep_sheet_audit.js`, `prune_vercel_deployments.js`, `fix_lead.js`, `build_with_maps_photos.js`, `rank_and_sync_new_leads.js`, `whatsapp_bot.js`).
   - One-time fix scripts (e.g. `fix_*.js`, `repair_*.cjs`, `test_*.js`, `upgrade_*.cjs`) must NEVER be created inside `scripts/`.

2. **Sanctioned Scratch Location**:
   - Store all temporary or intermediate scripts in the external session scratch directory:
     `<appDataDir>/brain/<conversation-id>/scratch/`
   - Alternatively, execute one-off logic inline via `node -e "..."`.

3. **Mandatory Post-Execution Purge**:
   - As soon as the one-time script completes its task and the result is verified, delete the script immediately.
   - Do not leave temporary scripts lingering on disk at the conclusion of a task.

4. **Git Pre-Commit Guardrail**:
   - Never stage (`git add`) or commit transient fix files into git history.
   - Always run `git status` prior to committing to ensure working directory hygiene.
