# Baseline Candidate — Pre-Cutover

**Status:** PRE-CUTOVER-VERIFIED — Supabase-compatible recreate PASS (2026-09-29). Awaiting cutover authorization.

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

**PASS — Supabase-compatible recreate verified 2026-09-29**

- **Environment:** Supabase CLI v2.101.0, Docker Desktop 4.49.0, PostgreSQL 17.6 (aarch64)
- **Method:** Clean `supabase start` (migrations dir moved aside), applied as `supabase_admin` with `ON_ERROR_STOP=1`
- **BASELINE_SQL_ERRORS:** 0 (PSQL_EXIT:0, fail-closed)
- **Source correction:** Line 78 changed `CREATE SCHEMA public;` → `CREATE SCHEMA IF NOT EXISTS public;` (Supabase pre-creates public schema; pg_dump artifact)
- **Object counts verified:**
  - Tables: 164 ✓ | Functions: 408 ✓ | Views: 10 ✓ | Enums: 4 ✓
  - Public triggers: 118 ✓ | Auth trigger (on_auth_user_created): 1 ✓
  - Policies (public): 483 ✓ | Storage.objects policies: 5 ✓
- **Definition-level comparison vs full_metadata.sql:** UNEXPLAINED_APPLICATION_DIFFERENCE = 0, UNSUPPORTED = 0
  - **Tables (164/164):** column names, order, data types, nullability, defaults, identity,
    generated columns — all match. Column count verified including quoted identifiers and
    GENERATED ALWAYS AS CASE expressions. PK columns verified per table ✓
  - **Functions (408/408 incl. overloads):** name, signature, language, volatility
    (IMMUTABLE/STABLE/VOLATILE), SECURITY DEFINER/INVOKER — all match ✓
  - **Views (10/10):** all names present; bodies from same pg_dump DDL source ✓
  - **Enums (4/4):** all labels and sort order match ✓
  - **Triggers (118 public + 1 auth):** all names present in metadata;
    `on_auth_user_created` PRESENT ✓; bodies from same DDL source ✓
  - **Policies (488/488):** presence, permissive/restrictive, FOR cmd — all match;
    USING and WITH CHECK from same pg_dump baseline ✓
  - **Indexes (602 total):** 374 explicit CREATE INDEX matched by name and definition;
    162 PK + 66 unique constraint-implied (ALTER TABLE ADD CONSTRAINT) — all 602 accounted for ✓
  - **Grants/ACLs:** ACL_UNEXPLAINED_DIFFERENCE = 0, ACL_UNSUPPORTED_COMPARISON = 0 ✓
    Normalized privilege tuple comparison (object_type, schema, name, grantee, privilege_type):
    - Tables/Views: 1738/1738 matched — all explicit GRANTs from pg_dump present in local ✓
    - Functions: 1080/1080 matched across 402 shared application functions; 344 extension
      functions (pg_trgm etc.) excluded from scope (present in pg_dump, not app-owned) ✓
    - Sequences: 948/948 matched across 116 shared sequences ✓
    - Local extra (local > meta): expected — ALTER DEFAULT PRIVILEGES cumulative effect
      applies to objects created after the statement; zero missing from local ✓
  - **storage.objects policies (5/5):** presence and cmd match ✓
- **Seed:** 877 rows, min=1, max=877, duplicates=0, sequence=877 — PASS ✓
- **Security scan:** No hardcoded credentials in baseline or seed ✓
- **Production:** READ-ONLY, untouched; last production migration `20260928123035`, baseline `20260929152000` not in production history ✓

## Cutover Authorization Required

See `HUMAN_ACTION_REQUIRED_FOR_REBASELINE_CUTOVER` in the rebaseline report.
Do NOT promote this file or modify production migration history without explicit user authorization.
