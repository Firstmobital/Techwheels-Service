# Database Change Ledger

Last Updated: 2026-07-01
Authority: See docs/shared/reference/DATABASE_TRUTH.md for the full hierarchy. supabase/backups/full_metadata.sql is primary for schema/object metadata; local_folder/backups/full_database.sql is primary for row/seed data and full DB evidence. Existing rows below predate this split and reference full_database.sql as written at the time — left as historical record, not rewritten.
Purpose: Single source of truth for planned and applied DB changes so no one guesses schema state.

---

## Rules

1. Every schema/RLS/function/view/index change must have a ledger row before implementation.
2. Every migration file in supabase/migrations must map to exactly one ledger row.
3. Status flow: PROPOSED -> APPROVED -> APPLIED -> VERIFIED -> ROLLED_BACK (if needed).
4. Row must include owner, reviewer, source evidence, and validation evidence.
5. If a change is dropped, set status DROPPED and add reason (do not delete history).

---

## Ledger Table

| ID | Date | Change Summary | Type | Migration File | Owner | Reviewer | Status | Applied Env | Validation Evidence | Authority Ref |
|----|------|----------------|------|----------------|-------|----------|--------|-------------|---------------------|---------------|
| DBL-0001 | 2026-05-23 | Start RBAC hardening documentation and tracking controls | docs/process | N/A | GitHub Copilot | Techwheels Admin | VERIFIED | N/A | docs updates committed | local_folder/backups/full_database.sql |
| DBL-0002 | 2026-05-23 | Add helper SQL functions for module permission checks (view/modify/delete) | function | supabase/exec_success_migrations/20260523120000_add_module_permission_helper_functions.sql | GitHub Copilot | Techwheels Admin + Dev Team | VERIFIED | Supabase SQL Editor (prod) | Executed on 2026-05-23; read-only checks passed (function signatures, SECURITY DEFINER/STABLE flags, EXECUTE grants, dependency helpers, smoke-call boolean output) | local_folder/backups/full_database.sql |
| DBL-0003 | 2026-05-23 | Introduce executed-migration archive workflow and folder | docs/process | N/A | GitHub Copilot | Techwheels Admin | VERIFIED | N/A | README + protocol updated; archive folder created | local_folder/backups/full_database.sql |
| DBL-0004 | 2026-05-23 | Tighten RLS for import/parts tables by replacing permissive anon policies with module-aware authenticated policies | rls | supabase/exec_success_migrations/20260523162000_phase33_tighten_parts_import_rls_locktimeout_retry.sql | GitHub Copilot | Techwheels Admin + Dev Team | VERIFIED | Supabase SQL Editor (prod) | Verified 2026-05-23 with read-only checks: phase33_status=READY, legacy_count=0, present_count=16, rls_count=5; legacy anon/authenticated permissive policies removed; 16 RBAC policies present across 5 tables | local_folder/backups/full_database.sql |
| DBL-0005 | 2026-05-23 | Register AutoDoc as top-level module for RBAC permission assignment | schema | supabase/migrations/20260523180000_add_autodoc_module.sql | GitHub Copilot | Techwheels Admin + Dev Team | VERIFIED | Supabase SQL Editor (prod) | Verified 2026-05-23: module_creation_check=PASS (count=1), autodoc_module_details=COMPLETE (id=9, name=autodoc, label=AutoDoc, route=/autodoc, sort_order=9, is_active=true), sequence_check=PASS | local_folder/backups/full_database.sql |
| DBL-0006 | 2026-06-11 | Change reception branch trigger precedence: prefer Employee Master location; fallback to SA-code branch mapping only when location is blank | function | supabase/migrations/20260611123000_prefer_employee_master_location_in_reception_trigger.sql | GitHub Copilot | Techwheels Admin | PROPOSED | N/A | Pending manual apply and post-apply validation (create/update reception rows for SA code variants including EAA_500A840) | local_folder/backups/full_database.sql (function `public.apply_sa_business_mapping_on_reception`) |
| DBL-0007 | 2026-06-29 | Auto service reminders tracking table, `wa_agent_config` reminder-config columns, pg_cron daily scheduler (`invoke_auto_service_reminder_daily`) | schema,function | supabase/migrations/20260629100000_auto_service_reminders.sql | GitHub Copilot | Techwheels Admin | VERIFIED | Supabase SQL Editor (prod) | Schema verified against supabase/backups/full_metadata.sql (table `public.auto_service_reminders`, `wa_agent_config.auto_reminder_*` columns, scheduler function present); paired checks in supabase/sql_checks/20260629100000_auto_service_reminders_checks.sql | supabase/backups/full_metadata.sql |
| DBL-0008 | 2026-06-30 | Make `settings_model_options` a global vehicle model catalog: dedupe cross-dealer rows, force `dealer_code = GLOBAL`, replace per-dealer unique with global unique on normalized active model name, global Settings RLS for CRUD, add `get_canonical_model_names()` RPC. | schema,rls,function,data-backfill | supabase/exec_success_migrations/sql/20260630120000_global_settings_model_options.sql | Cursor Agent | Techwheels Admin | VERIFIED | Supabase SQL Editor (prod) | Applied manually 2026-06-30; sql_checks passed (all rows `dealer_code=GLOBAL`, 19 active unique models, global unique index + CHECK present, normalize trigger + RPC + 6 RLS policies); post-apply metadata refresh `npm run db:backup:metadata` sha256=dc1d49909baef9d9b02562a570bec29fd8bb3100f90db4e165d68a2e7e1b149d; promoted to exec_success_migrations | supabase/backups/full_metadata.sql (`public.settings_model_options`, `public.get_canonical_model_names()`) |
| DBL-0009 | 2026-07-01 | Post-service feedback tracking table, `wa_agent_config` feedback-config columns (incl. wiring to the already Meta-approved `post_service_feedback_v1` Flow template and `google_review_link`), pg_cron daily scheduler (`invoke_post_service_feedback_daily`) | schema,function | supabase/migrations/20260701090000_post_service_feedback.sql | Claude | Techwheels Admin | PROPOSED | N/A | Pending manual apply in Supabase SQL Editor and post-apply validation via paired checks in supabase/sql_checks/20260701090000_post_service_feedback_checks.sql | supabase/backups/full_metadata.sql |

---

## Change Types

- schema: table/column/constraint/index changes
- rls: policy and permission boundary changes
- function: SQL function/procedure changes
- data-backfill: controlled data update script
- docs/process: governance and tracking control updates

---

## How to Add a New Row

Add a new row when drafting a change proposal with:

- New unique ID: DBL-XXXX
- Draft migration filename (or N/A for docs/process)
- Owner and reviewer
- Status PROPOSED
- Authority reference section pointing to dump/function/table in local_folder/backups/full_database.sql

When migration is applied, update same row (never create duplicate row for same migration).
