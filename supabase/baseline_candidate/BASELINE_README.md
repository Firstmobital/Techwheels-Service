# Baseline Candidate — Pre-Cutover

**Status:** CANDIDATE — Real executable SQL. Requires local recreate test + user authorization before promotion.

**Generated:** 2026-09-29
**Source:** `supabase/backups/full_metadata.sql` + pg_dump --schema=public (PostgreSQL 17.6)
**Metadata SHA256:** 9a69163027bcb9d30f51a62c27a2ed2d68fbe7e04d27a7ba7c6544b7d8746ff2

## Contents

- `20260929152000_production_schema_baseline.sql` — Real executable baseline SQL (46,484 lines)
  - **Part 1:** public schema (164 tables, 408 functions, 118 triggers, 483 policies,
    10 views, 4 enums, ~374 indexes, grants) — from pg_dump --schema=public
  - **Part 2:** auth.users application customization (on_auth_user_created trigger)
  - **Part 3:** storage.objects application policies (5 autodoc RLS policies)

## Baseline Scope

### Included (application-owned)
- All `public.*` schema objects
- `auth.users` trigger: `on_auth_user_created` → `public.handle_new_user()`
- `storage.objects` RLS: 5 autodoc policies (own-dealer CRUD + recovery read)

### Excluded (platform-managed)
- `auth.*` base tables/functions/triggers (Supabase-managed)
- `storage.*` base tables/functions (Supabase-managed)
- `realtime.*`, `graphql.*`, `pgbouncer.*` (platform-managed)
- `supabase_migrations.*` (migration tracking — managed separately)
- `complaints_test.*` (unused test schema)
- Extension internals (enabled via config.toml + Supabase Dashboard)

## Cron Job Bootstrap (not in baseline SQL — runtime DATA)

Cron jobs are stored in `cron.job` table rows, NOT schema DDL. They are not in
this baseline. After a fresh deploy, call these functions to re-register jobs:

| Job name | Bootstrap function | Trigger |
|---|---|---|
| `auto-service-reminder-daily-ist` | `reschedule_auto_service_reminder_cron(p_send_time)` | wa_agent_config update |
| `ew-renewal-reminder-daily-ist` | `reschedule_ew_renewal_reminder_cron(p_send_time)` | wa_agent_config update |
| `ew-service-reminder-daily-ist` | `reschedule_ew_service_reminder_cron(p_send_time)` | wa_agent_config update |
| `post-service-feedback-daily-ist` | `reschedule_post_service_feedback_cron(p_send_time)` | wa_agent_config update |
| `updation-reminder-daily-ist` | `reschedule_updation_reminder_cron(p_send_time)` | wa_agent_config update |
| `send-chat-push` | `register_send_chat_push_cron()` | Must be called explicitly |
| RC fetch worker | Configured via pg_cron + `invoke_insurance_renewal_rc_fetch_worker()` | Manual setup |

**All time-based jobs** are re-registered automatically when `wa_agent_config` is updated
(via the reschedule functions). Only `send-chat-push` and the RC fetch job need
explicit bootstrap calls after a fresh deploy.

**Vault secret:** `invoke_insurance_renewal_rc_fetch_worker()` requires `telecalling_cron_secret`
in Supabase Vault. Seed it manually via Dashboard → Vault before enabling the RC fetch cron.

## Required Seed Data (NOT in baseline schema)

| Table | Rows | Classification | Source |
|---|---|---|---|
| `settings_service_parts_pricing` | 877 | REQUIRED_REFERENCE_DATA | `seed_settings_service_parts_pricing.sql` (extracted from migration, INSERT block only) |

Seed file extracted to `supabase/baseline_candidate/seed_settings_service_parts_pricing.sql`.
Apply AFTER the baseline SQL. The original DDL migration must NOT be re-applied (table already created by baseline).
Verified: 877 rows, last id = 877, sequence setval included, no hardcoded credentials.

## Local Recreate Status

**BLOCKED** — Docker daemon unresponsive due to containerd metadata.db corruption from prior disk-full event.
`docker system prune --volumes` was attempted but Docker daemon hung (bolt meta.db deadlock).

**Requires user action:** Restart Docker Desktop from the macOS menu bar → Docker icon → Restart.
After restart:
1. Run `docker system prune --volumes --force` to clear corrupted layers
2. Re-pull Supabase images: `supabase start` (requires ~5GB free disk space; currently 5.1Gi available)
3. Apply baseline: `psql -h localhost -p 54322 -U postgres -d postgres -f 20260929152000_production_schema_baseline.sql`
4. Verify object counts: 164 tables, 408 functions, 10 views, 4 enums, 118+ triggers, 483+ policies
5. Apply seed: `psql -h localhost -p 54322 -U postgres -d postgres -f seed_settings_service_parts_pricing.sql`
6. Verify: `SELECT count(*) FROM public.settings_service_parts_pricing;` → expect 877

## Cutover Authorization Required

See `HUMAN_ACTION_REQUIRED_FOR_REBASELINE_CUTOVER` in the rebaseline report.
Do NOT promote this file or modify production migration history without explicit user authorization.
