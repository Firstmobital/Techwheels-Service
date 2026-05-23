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
4. Update ledger status to APPROVED once reviewer signs off.
5. Apply migration manually in target environment.
6. Update ledger status to APPLIED and add execution evidence.
7. Validate behavior (queries/tests/build checks) and set status VERIFIED.
8. Update handbook docs: CURRENT_STATE.md, CHANGE_LOG.md, README.md if behavior changed.

## Minimum Evidence Required

- Migration filename
- Execution timestamp and environment
- Validation proof (query output, test result, or functional verification)
- Rollback command/file reference

## Ownership Model

- Author: person writing migration and ledger row
- Reviewer: person approving SQL and policy impact
- Operator: person applying migration to environment
- QA owner: person validating behavior after apply

No step may be skipped. If skipped, status stays BLOCKED.
