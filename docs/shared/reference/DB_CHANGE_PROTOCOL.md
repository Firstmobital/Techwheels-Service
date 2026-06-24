# Database Change Protocol

Last Updated: 2026-06-24
Status: Mandatory

## Goal

Prevent schema drift and prevent assumption-based development by enforcing one workflow for all DB changes.

## Authority Rule

- Authoritative source: local_folder/backups/full_database.sql
- AI/large-file access layer: local_folder/backups/chunks/full_database.sql.part_*
- Fallback reference only (non-canonical): supabase/backups/full_dump.sql
- If code and migration assumptions differ from authority, authority wins until a new migration is authored and approved.

## Required Workflow

1. Create/Update plan item in docs/Implementation_plans/*.md.
2. Add ledger row in docs/shared/reference/DB_CHANGE_LEDGER.md with status PROPOSED.
3. Create migration SQL in supabase/migrations with reversible strategy.
4. Create paired read-only verification SQL in supabase/sql_checks using same timestamp prefix.
5. Update ledger status to APPROVED once reviewer signs off.
6. Apply migration manually in target environment.
7. Update ledger status to APPLIED and add execution evidence.
8. Run paired sql_checks script, capture output, and set status VERIFIED.
9. Move successfully executed migration file from supabase/migrations to supabase/exec_success_migrations/sql.
10. Move the paired sql_checks file from supabase/sql_checks to supabase/exec_success_migrations/sql_check.
11. Record promotion in supabase/evidence/execution_promotion_log.md and supabase/evidence/post_dump_verified_promotions.md.
12. Update handbook docs: CURRENT_STATE.md, CHANGE_LOG.md, README.md if behavior changed.

## Human-In-The-Loop Validation Cycle

1. Operator runs migration manually.
2. Operator runs sql_checks manually and shares outputs.
3. Reviewer validates pass/fail from outputs.
4. If fail: fix migration/checks, rerun checks.
5. If pass: promote files to exec_success_migrations/sql and exec_success_migrations/sql_check.

## SQL Check File Header Rule (Mandatory)

Every file under supabase/sql_checks must include an explicit execution note near the top:

- `Execution: This file can be run in one go.`
- `Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.`

## Minimum Evidence Required

- Migration filename
- Paired sql_checks filename
- Execution timestamp and environment
- Validation proof (query output, test result, or functional verification)
- Rollback command/file reference

## Ownership Model

- Author: person writing migration and ledger row
- Reviewer: person approving SQL and policy impact
- Operator: person applying migration to environment
- QA owner: person validating behavior after apply

No step may be skipped. If skipped, status stays BLOCKED.
