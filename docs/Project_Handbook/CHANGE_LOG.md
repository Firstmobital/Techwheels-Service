# Project Handbook Change Log

Tracks documentation-sync updates for business logic, architecture, and access control.

## 2026-05-22

- Added initial living handbook system under `docs/Project_Handbook/`.
- Added full handbook (`README.md`) covering architecture, domains, RBAC/RLS, runbook, and risks.
- Added mandatory docs-sync protocol (`SYNC_PROTOCOL.md`).
- Added impact mapping matrix (`DOCS_IMPACT_MATRIX.md`).
- Added real-state snapshot file (`CURRENT_STATE.md`).

## 2026-05-23

- Added RBAC daily standup checklist: `docs/Implementation_plans/RBAC-001_DAILY_STANDUP_CHECKLIST.md`.
- Added DB governance files:
	- `docs/Project_Handbook/DB_CHANGE_LEDGER.md`
	- `docs/Project_Handbook/DB_CHANGE_PROTOCOL.md`
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
- Added Phase 3.3 RBAC hardening draft migration: `supabase/migrations/20260523143000_phase33_tighten_parts_import_rls.sql`.
- Added temporary paired verification script: `supabase/sql_checks/20260523143000_phase33_tighten_parts_import_rls_checks.sql`.
- Added DB ledger proposal entry: `DBL-0004`.
- Recorded DBL-0004 SQL Editor timeout during initial apply attempt.
- Added lock-safe retry migration: `supabase/migrations/20260523153000_phase33_tighten_parts_import_rls_locksafe_retry.sql`.
- Added paired lock-safe read-only verification script: `supabase/sql_checks/20260523153000_phase33_tighten_parts_import_rls_locksafe_retry_checks.sql`.

Template for future entries:

- Date:
- Change summary:
- Impacted files:
- Business logic change:
- Function-level contract change:
- RBAC/RLS change:
- Data/schema change:
- Docs updated by:
