# Publication Readiness Disposition — 2026-06-30

**Classification:** state = evidence, scope = shared, intent = evidence  
**Authority:** `docs/shared/reference/SYNC_PROTOCOL.md` (Evidence routing); machine-readable companion: `publication_readiness_disposition.json`

## Scope

Publish-readiness resolution for the pending working-tree change set (19 files excluding the self-generated impact report).

## Blockers Resolved

| Blocker | Resolution |
|---|---|
| Unmapped `AGENTS.md` | Removed — empty vendor AI stub violating `.instructions.md` Section 1 |
| Missing DB ledger row for `20260629100000_auto_service_reminders_checks.sql` | Added `DBL-0007` as VERIFIED (schema in `full_metadata.sql`) |
| PROPOSED `DBL-0008` migration/checks | Operator-verified during aborted publish:safe — ledger DBL-0008 VERIFIED; files promoted to `exec_success_migrations/` |

## Current DB State (post-operator work)

DBL-0008 is **VERIFIED** in `DB_CHANGE_LEDGER.md` with operator apply + sql_checks + metadata refresh evidence. The old `supabase/migrations/` and `supabase/sql_checks/` paths no longer exist locally; promoted copies live under `exec_success_migrations/`. `deferred_db_changes` is empty in the disposition JSON.

## DB Ledger / Protocol Status

| ID | File(s) | Status | Publication |
|---|---|---|---|
| DBL-0006 | reception trigger migration | PROPOSED | Not in this change set |
| DBL-0007 | auto_service_reminders migration + checks | VERIFIED | Checks file may publish; migration promotion to exec_success pending separate operator step |
| DBL-0008 | global settings_model_options migration + checks | PROPOSED | **Deferred** — do not publish migration/check files until operator apply + verification |

## Validation Commands Run

| Command | Result |
|---|---|
| `npm run docs:validate:plans` | Pass |
| `npm run docs:validate:health` | Advisory exit 1 (1 promotion-gap flag — routed, non-blocking) |
| `npm run docs:impact` | Pass |
| `node --check scripts/publish_readiness_check.mjs` | Pass |
| `node --check scripts/repo_change_impact.mjs` | Pass |
| `bash -n scripts/git-safe-publish.sh` | Pass |

## Operator Follow-Up Required

1. Apply `supabase/migrations/20260630120000_global_settings_model_options.sql` manually.
2. Run `supabase/sql_checks/20260630120000_global_settings_model_options_checks.sql` and capture output.
3. Update `DBL-0008` to VERIFIED with evidence; promote files per `DB_CHANGE_PROTOCOL.md` steps 9–11.
4. Re-run `npm run publish:ready` before publishing DBL-0008 files.
