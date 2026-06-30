# Task Contract: Database Change

Classification: state = truth, scope = shared, intent = reference (catalog/task_library/generic).

This is a reusable repository task contract, not a prompt. It describes the repeatable structure of a database-change task (schema, RLS, function/RPC, view, or index) so any execution of that task follows the same authorities, steps, and routing.

## Purpose

Propose, apply, and verify a database schema/RLS/function/view/index change through the repository's existing change-control workflow, keeping the database truth hierarchy authoritative and never hand-editing generated truth files.

## Inputs

1. The proposed change (table/column/type/constraint/index/view/function/RPC/trigger/policy/grant).
2. Reason for the change and affected module(s).
3. Current schema state for the affected objects (must be verified, not assumed).

## Authorities

1. `docs/shared/reference/DATABASE_TRUTH.md` — the authoritative hierarchy: `supabase/backups/full_metadata.sql` (primary, schema) -> `local_folder/backups/full_database.sql` (secondary, schema+data) -> its chunk mirror (access fallback only).
2. `docs/shared/reference/DB_CHANGE_PROTOCOL.md` — required workflow for proposing/applying/verifying schema changes.
3. `docs/shared/reference/DB_CHANGE_LEDGER.md` — change log of schema/RLS/function/view/index changes.
4. `.instructions.md` Section 8 (Database Truth Authority) — never invent database objects; verify against the dump files.
5. `docs/STRUCTURE_GUIDE.md` Section 11 (Database Truth Audit Guardrail) — repository-specific override confirming the same hierarchy for docs/planning tasks.

## Execution

1. Verify current object state against `full_metadata.sql` (schema questions) or `full_database.sql`/its chunks (data/cross-check questions) before proposing anything — never assume a table/column/policy/function exists or has a given shape.
2. Follow `docs/shared/reference/DB_CHANGE_PROTOCOL.md`'s propose/apply/verify workflow for the change.
3. Add or update a row in `docs/shared/reference/DB_CHANGE_LEDGER.md` for the change.
4. Apply the migration through the repository's existing migration mechanism (`supabase/migrations/`); move successful migrations per the existing convention (`supabase/exec_success_migrations/`) — do not invent a new migration path.
5. After the change is applied and verified, refresh the truth files only via the existing generator scripts: `scripts/backup-metadata.sh` (schema) or `scripts/backup-full-db.sh` (full dump + chunks) — never hand-edit `full_metadata.sql`, `full_database.sql`, or the chunk parts.
6. Run the Repository Lifecycle Protocol Self-Heal Check (`docs/shared/reference/SYNC_PROTOCOL.md`) before finishing.

## Expected Outputs

1. Applied and verified migration.
2. Updated `DB_CHANGE_LEDGER.md` row.
3. Refreshed truth file(s), generated only by the scripts above, if a refresh was actually needed.
4. Verification evidence (query result, test, or audit comparison confirming the change matches intent).

## Output Classification

Classify each output using the categories in `docs/shared/reference/SYNC_PROTOCOL.md` ("Classification" table). The primary category for this contract is Database/schema result; Evidence and Generated Artifact may also apply.

## Output Routing

Route every output using the table in `docs/shared/reference/SYNC_PROTOCOL.md` (Database/schema result and Generated Artifact rows) and its Index Update Rule. This contract does not restate those routes or the Generated Artifact Rule — see `SYNC_PROTOCOL.md` directly.

## Validation

1. Re-verify the changed object against a freshly regenerated `full_metadata.sql` (never against the pre-change dump).
2. Confirm `DB_CHANGE_LEDGER.md` and `DB_CHANGE_PROTOCOL.md` workflow steps are both satisfied.
3. `npm run docs:validate:health` (advisory) — checks for DB-truth-hierarchy contradiction flags and generated-artifact drift.

## Completion Criteria

1. Change applied, verified, and ledgered.
2. Truth files refreshed only through their generator scripts, with no hand edits.
3. Repository Lifecycle Report (and AI Output Intake Report) filed, naming which truth file was refreshed and how, or stating explicitly that no refresh was needed.
