# DB Truth Protocol (No Drift)

Last Updated: 2026-11-25

## Objective

Keep schema understanding aligned with production reality between dump refreshes and prevent migration-state drift.

This file covers the operational rules for staying in sync between dump refreshes. For the canonical Database Authority Hierarchy (which file is primary, which is secondary, why chunks exist, AI-agent inspection rules), see `docs/shared/reference/DATABASE_TRUTH.md` — that file is authoritative if anything below conflicts with it.

> **Status note (2026-11-25):** the promotion workflow in this file (moving migrations to `exec_success_migrations/`, the post-dump promotion window and `scripts/promote_verified_migration.sh`) is **historical**: it applied before the 2026-09-29 rebaseline and is tied to the **full-database dump**. Its artifacts are preserved. The current lifecycle is in `docs/shared/reference/DATABASE_TRUTH.md` ("Evidence Terms and Post-Rebaseline Change Lifecycle") and `docs/shared/reference/DB_CHANGE_PROTOCOL.md`. `scripts/backup-metadata.sh` does not reset or read the promotion window.

## Authority Model

1. Primary authority for schema/object metadata (tables, columns, types, constraints, indexes, views, functions/RPCs, triggers, RLS, policies, grants):
- supabase/backups/full_metadata.sql

2. Primary authority for row data, seed/lookup/master data, and complete database evidence:
- local_folder/backups/full_database.sql

3. If direct file reads of full_database.sql are blocked due to size limits, use exact mirror chunks:
- local_folder/backups/chunks/full_database.sql.part_*

4. Between metadata snapshot refreshes, the snapshot remains the only structural truth. Changes applied after it are post-snapshot execution evidence (ledger rows + migration files), not structural proof. *(Historical, before 2026-09-29: composite truth = latest dump + migrations promoted to `supabase/exec_success_migrations/sql` and `sql_check`.)*

5. When a fresh metadata snapshot is created (`npm run db:backup:metadata`), authority collapses back to that snapshot as primary schema truth.

## Automation Assets

1. Metadata (schema) dump refresh automation:
- scripts/backup-metadata.sh

2. Full database dump + chunk mirror refresh automation:
- scripts/backup-full-db.sh
- (scripts/refresh_authoritative_dump.sh still works — it now just calls scripts/backup-full-db.sh for backward compatibility)

3. Verified migration promotion automation (historical, pre-2026-09-29; preserved, not used for post-rebaseline migrations):
- scripts/promote_verified_migration.sh

4. Evidence files maintained automatically:
- supabase/evidence/authoritative_metadata_manifest.json (written by `scripts/backup-metadata.sh`; identity of the metadata snapshot)
- supabase/evidence/authoritative_dump_manifest.json (written by `scripts/backup-full-db.sh`; identity of the full-database dump)
- supabase/evidence/post_dump_verified_promotions.md (historical window, reset only by `scripts/backup-full-db.sh`; its baseline is the full-database manifest)
- supabase/evidence/execution_promotion_log.md (historical; appended only by `scripts/promote_verified_migration.sh`)

## Historical Promotion Rule (Executed + Verified; pre-2026-09-29, not used post-rebaseline)

After user shares successful SQL-check results:

1. Move migration SQL:
- from supabase/migrations/
- to supabase/exec_success_migrations/sql/

2. Move matching SQL-check files:
- from supabase/sql_checks/
- to supabase/exec_success_migrations/sql_check/

3. Record promotion evidence in:
- supabase/evidence/execution_promotion_log.md

## Recommended Command

Use the promotion helper:

```bash
scripts/promote_verified_migration.sh 20260624103000 --with-checks
```

Use the dump refresh helpers (after exporting SUPABASE_DB_HOST/PORT/NAME/USER/PASSWORD — see .env.example):

```bash
scripts/backup-metadata.sh   # supabase/backups/full_metadata.sql
scripts/backup-full-db.sh    # local_folder/backups/full_database.sql + chunks
```

## Required Guardrails

1. Never promote without successful verification evidence.
2. Never infer execution from file presence alone.
3. Never downgrade authority to older dumps.
4. If dump and docs conflict, dump wins.

## Operational Checklist (post-rebaseline)

1. Apply the authorized migration (operator).
2. Run the paired SQL checks and record the output in the ledger.
3. Set the ledger status only as far as the recorded evidence supports (APPLIED, then VERIFIED).
4. Refresh the snapshot with `npm run db:backup:metadata` and commit `full_metadata.sql` with its manifest.
5. Keep the migration and checks in `supabase/migrations/` and `supabase/sql_checks/`.

## Historical Operational Checklist (pre-2026-09-29)

1. Apply migration in SQL editor.
2. Run SQL checks and verify pass.
3. Promote files to exec_success_migrations.
4. Log evidence.
5. Continue using composite truth until next dump refresh. *(Historical.)*

## Decision Rules

1. If a migration was applied after the latest metadata snapshot and no new snapshot exists:
- trust model = latest snapshot for structure; the matching ledger row and migration file are post-snapshot execution evidence only
- *(Historical, pre-2026-09-29: latest dump + promoted files listed in post_dump_verified_promotions.md)*

2. If a full-database dump is created later:
- scripts/backup-full-db.sh resets post_dump_verified_promotions.md window (a metadata refresh does not)
- new dump manifest becomes the baseline truth
- subsequent promotions become the new post-dump delta set

## Validation and Promotion Gate

1. SQL checks are manually executed and manually reviewed from shared output.
2. Promotion is performed only after check output is explicitly confirmed as pass.
3. If checks fail, migration/check SQL must be corrected and checks rerun before any promotion.
