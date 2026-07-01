# Project Handbook Change Log

Tracks documentation-sync updates for business logic, architecture, and access control.

## 2026-07-01 (upstream intake PR #16 + parts report, self-healed)

- CRE dropdowns on Service Booking (`/service-booking`) and Telecalling booking/lead forms now source options from `employee_master` where `role = 'CRE'` (replacing prior `users`-table role filters).
- Driver dropdowns on the same surfaces now source options from `employee_master` where `role = 'DRIVER'`.
- Added Parts report **Stock Discipline & Reorder** at route `/reports/parts/parts-stock-discipline` (report id `parts-stock-discipline`): 20-day cover analysis with pipeline deduction, dead-stock flag, and reorder sheet export.
- Docs updated by: incoming-change knowledge self-healing pass — `CHANGE_LOG.md`, `TELECALLING_MODULE_FLOW_AND_BUSINESS_LOGIC.md`, `CURRENT_STATE.md`, `README.md` §5.2.

## 2026-06-30

- Applied DBL-0008: global vehicle model catalog on `public.settings_model_options` — deduped cross-dealer rows (54→19), forced `dealer_code = GLOBAL`, added global unique index on normalized active model name, normalize trigger, global Settings RLS, and `get_canonical_model_names()` RPC.
- Updated web API `src/lib/api/settings.ts` to insert/read global models via `GLOBAL` dealer code and canonical RPC fallback.
- Promoted migration/check pair to `supabase/exec_success_migrations/`; refreshed schema truth via `npm run db:backup:metadata` (sha256=dc1d49909baef9d9b02562a570bec29fd8bb3100f90db4e165d68a2e7e1b149d).

## 2026-06-29 (upstream intake, audited and self-healed 2026-06-30)

- Pulled 16 upstream commits (PRs #9-#12, branches `claude/auto-service-reminder-v2` and `claude/whatsapp-service-reminders-e0evte`) via rebase onto `origin/main`. 7 files touched, all application/infra code — no overlap with `docs/`, `scripts/`, or `.github/`.
- Bodyshop Floor: removed `ELECTRICIAN`/`DET` roles, kept `DENTOR`/`PAINTER`/`TECHNICIAN`; replaced single employee_code/employee_name fields with multi-employee chip assignment.
- Added `auto_service_reminders` tracking table, `wa_agent_config` reminder-config columns, and a pg_cron daily scheduler (`invoke_auto_service_reminder_daily`) — migration `supabase/migrations/20260629100000_auto_service_reminders.sql`.
- Fixed `wa-auto-service-reminder` and `wa-webhook` edge functions (perf parallelization, Flow button component, `todayStr` ReferenceError, `auto_reply_enabled` block), `telecalling` edge function (removed nonexistent `booking_time` column references), and `ServiceBookingPage.tsx` display labels.
- Business logic change: Bodyshop Floor role model (5 roles → 3 roles + multi-employee); new automated WhatsApp service-reminder pipeline.
- Function-level contract change: `invoke_auto_service_reminder_daily()` (new), `wa-auto-service-reminder`/`wa-webhook`/`telecalling` edge function behavior.
- Data/schema change: new table `public.auto_service_reminders`; new columns on `public.wa_agent_config` (`auto_reminder_enabled`, `auto_reminder_template_id`, `auto_reminder_template_lang`, `auto_reminder_variable_map`). Additive-only.
- Docs updated by: Post-Publication Incoming Change Intake Audit + self-healing pass (2026-06-30) — added DB ledger row `DBL-0007`, added paired check `supabase/sql_checks/20260629100000_auto_service_reminders_checks.sql`, updated `CURRENT_STATE.md` WhatsApp domain table list, corrected the stale 5-role references in `Bodyshop-Flow.md` (§3.3) and `BODYSHOP-QUEUE-001_...md`.

## 2026-06-11

- Added migration to change reception branch mapping precedence so Employee Master forced location wins before SA-code fallback mapping.
- New migration file: `supabase/migrations/20260611123000_prefer_employee_master_location_in_reception_trigger.sql`.
- Updated trigger function contract: `public.apply_sa_business_mapping_on_reception()` now reads `employee_master.location` first and only falls back to `%500A840%/%3001440%/%3000840%` branch mapping when location is blank.
- Added DB ledger entry `DBL-0006` with status `PROPOSED` pending manual migration apply and verification evidence.

## 2026-05-22

- Added initial living handbook system under `docs/shared/`.
- Added full handbook (`README.md`) covering architecture, domains, RBAC/RLS, runbook, and risks.
- Added mandatory docs-sync protocol (`SYNC_PROTOCOL.md`).
- Added impact mapping matrix (`DOCS_IMPACT_MATRIX.md`).
- Added real-state snapshot file (`CURRENT_STATE.md`).

## 2026-05-23

- Added RBAC daily standup checklist: `docs/Implementation_plans/RBAC-001_DAILY_STANDUP_CHECKLIST.md`.
- Added DB governance files:
	- `docs/shared/reference/DB_CHANGE_LEDGER.md`
	- `docs/shared/reference/DB_CHANGE_PROTOCOL.md`
- Added RBAC migration foundation file: `supabase/migrations/20260523120000_add_module_permission_helper_functions.sql`.
- Added DB ledger proposal entry: `DBL-0002`.
- Added executed migration archive folder: `supabase/exec_success_migrations/` with usage README.
- Updated migration/process docs to move verified SQL files out of `supabase/migrations/`.
- Updated RBAC implementation plan and index to include compact tracker and update conditions.
- Updated sync protocol to require DB ledger/protocol use for schema/RLS/function changes.
- Updated current-state snapshot to reflect deny-by-default frontend RBAC and new DB tracking governance.
- Updated DBL-0002 status to APPLIED after SQL editor execution.
- Added paired SQL verification workflow: each migration now requires a read-only check script in `supabase/sql_checks/`.
- Added check script for DBL-0002: `supabase/sql_checks/20260523120000_add_module_permission_helper_functions_checks.sql`.
- Verified DBL-0002 using read-only checks and archived migration to `supabase/exec_success_migrations/20260523120000_add_module_permission_helper_functions.sql`.
- Deleted the temporary DBL-0002 check script from `supabase/sql_checks/` after verification evidence was captured.
- Created migration to register AutoDoc as top-level module (DBL-0005):
	- Migration file: `supabase/migrations/20260523180000_add_autodoc_module.sql`
	- AutoDoc module: name=`autodoc`, label=`AutoDoc`, route=`/autodoc`, sort_order=9, active=true
	- Enables RBAC permission assignment for vehicle documentation workflows
	- Verified with all checks passing: module_creation_check=PASS, autodoc_module_details=COMPLETE, sequence_check=PASS
	- Updated ledger: DBL-0005 → VERIFIED
- Added Phase 3.3 RBAC hardening draft migration: `supabase/migrations/20260523143000_phase33_tighten_parts_import_rls.sql`.
- Added temporary paired verification script: `supabase/sql_checks/20260523143000_phase33_tighten_parts_import_rls_checks.sql`.
- Added DB ledger proposal entry: `DBL-0004`.
- Recorded DBL-0004 SQL Editor timeout during initial apply attempt.
- Added lock-safe retry migration: `supabase/migrations/20260523153000_phase33_tighten_parts_import_rls_locksafe_retry.sql`.
- Added paired lock-safe read-only verification script: `supabase/sql_checks/20260523153000_phase33_tighten_parts_import_rls_locksafe_retry_checks.sql`.
- Recorded that first lock-safe NOWAIT retry executed as no-op under active table locks (no RLS/policy state change).
- Added lock-timeout retry migration: `supabase/migrations/20260523162000_phase33_tighten_parts_import_rls_locktimeout_retry.sql`.
- Added read-only preflight/failure diagnostics script: `supabase/sql_checks/20260523170000_phase33_preflight_and_failure_diagnostics.sql`.
- Verified DBL-0004 in production via paired read-only checks (`READY`, `legacy_count=0`, `present_count=16`, `rls_count=5`).
- Archived successful DBL-0004 migration to `supabase/exec_success_migrations/20260523162000_phase33_tighten_parts_import_rls_locktimeout_retry.sql`.
- Removed temporary DBL-0004 check scripts from `supabase/sql_checks/` after verification evidence capture.

Template for future entries:

- Date:
- Change summary:
- Impacted files:
- Business logic change:
- Function-level contract change:
- RBAC/RLS change:
- Data/schema change:
- Docs updated by:
