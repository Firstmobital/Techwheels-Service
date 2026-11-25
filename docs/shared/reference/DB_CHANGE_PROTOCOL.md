# Database Change Protocol

Last Updated: 2026-11-25
Status: Mandatory

## Goal

Prevent schema drift and prevent assumption-based development by enforcing one workflow for all DB changes.

## Authority Rule

See `docs/shared/reference/DATABASE_TRUTH.md` for the full, authoritative Database Authority Hierarchy. Summary:

- Primary (schema/object metadata): supabase/backups/full_metadata.sql
- Secondary (row data, seed/lookup data, full DB evidence): local_folder/backups/full_database.sql
- AI/large-file access layer (mirror of the secondary file only): local_folder/backups/chunks/full_database.sql.part_*
- Historical / non-canonical: supabase/backups/full_dump.sql (superseded by full_metadata.sql)
- If code and migration assumptions differ from authority, authority wins until a new migration is authored and approved.
- Artifact terms (snapshot, manifests, migration history, applied-environment evidence, verification evidence, historical promotions) are defined once in `DATABASE_TRUTH.md` ("Evidence Terms and Post-Rebaseline Change Lifecycle"). Ledger text is execution evidence, not proof of current structure.

## Required Workflow (post-rebaseline)

1. Create/Update plan item in docs/Implementation_plans/*.md.
2. Add ledger row in docs/shared/reference/DB_CHANGE_LEDGER.md with status PROPOSED: one row per approved change set. A row may name several migration files (full filenames) only when they share the same lifecycle and verification state; migrations in different states need separate rows.
3. Create migration SQL in supabase/migrations with reversible strategy.
4. Create paired read-only verification SQL in supabase/sql_checks using same timestamp prefix.
5. Update ledger status to APPROVED once reviewer signs off.
6. Apply migration manually in target environment (explicit authorization required).
7. Update ledger status to APPLIED and record the applied environment, date/time and operator.
8. Run paired sql_checks script, record the output (or a reference to it) in the row's validation evidence, and set VERIFIED only when that output or UAT result is recorded.
9. Leave the migration in supabase/migrations and the checks in supabase/sql_checks. Do not move them to supabase/exec_success_migrations (historical, pre-2026-09-29).
10. Refresh the snapshot with `npm run db:backup:metadata` and commit supabase/backups/full_metadata.sql with supabase/evidence/authoritative_metadata_manifest.json. The ledger row may cite the snapshot commit as capture evidence; capture does not change status.
11. Update handbook docs: CURRENT_STATE.md, CHANGE_LOG.md, README.md if behavior changed.

Historical (pre-2026-09-29, preserved): steps that moved executed files to exec_success_migrations/ and recorded them in execution_promotion_log.md and post_dump_verified_promotions.md. See DB_TRUTH_PROTOCOL.md.

## Human-In-The-Loop Validation Cycle

1. Operator runs migration manually.
2. Operator runs sql_checks manually and shares outputs.
3. Reviewer validates pass/fail from outputs.
4. If fail: fix migration/checks, rerun checks.
5. If pass: record the output in the ledger, then refresh and commit the metadata snapshot (steps 8-10 above).

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
