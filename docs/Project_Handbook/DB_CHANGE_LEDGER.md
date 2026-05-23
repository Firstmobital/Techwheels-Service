# Database Change Ledger

Last Updated: 2026-05-23
Authority: local_folder/backups/full_database.sql is the authoritative schema reference.
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
