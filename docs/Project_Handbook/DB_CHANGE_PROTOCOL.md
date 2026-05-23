# Database Change Protocol

Last Updated: 2026-05-23
Status: Mandatory

## Goal

Prevent schema drift and prevent assumption-based development by enforcing one workflow for all DB changes.

## Authority Rule

- Authoritative source: local_folder/backups/full_database.sql
- If code and migration assumptions differ from authority, authority wins until a new migration is authored and approved.

## Required Workflow

1. Create/Update plan item in docs/Implementation_plans/*.md.
2. Add ledger row in docs/Project_Handbook/DB_CHANGE_LEDGER.md with status PROPOSED.
3. Create migration SQL in supabase/migrations with reversible strategy.
4. Create paired read-only verification SQL in supabase/sql_checks using same timestamp prefix.
5. Update ledger status to APPROVED once reviewer signs off.
6. Apply migration manually in target environment.
7. Update ledger status to APPLIED and add execution evidence.
8. Run paired sql_checks script, capture output, and set status VERIFIED.
9. Move successfully executed migration file from supabase/migrations to supabase/exec_success_migrations.
10. Delete the paired sql_checks file after verification evidence is recorded to keep supabase/sql_checks temporary-only.
11. Update handbook docs: CURRENT_STATE.md, CHANGE_LOG.md, README.md if behavior changed.

## Minimum Evidence Required

- Migration filename
- Paired sql_checks filename (recorded in evidence even if the check file is later deleted)
- Execution timestamp and environment
- Validation proof (query output, test result, or functional verification)
- Rollback command/file reference

## Ownership Model

- Author: person writing migration and ledger row
- Reviewer: person approving SQL and policy impact
- Operator: person applying migration to environment
- QA owner: person validating behavior after apply

No step may be skipped. If skipped, status stays BLOCKED.
