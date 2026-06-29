# DB Truth Protocol (No Drift)

Last Updated: 2026-06-29

## Objective

Keep schema understanding aligned with production reality between dump refreshes and prevent migration-state drift.

This file covers the operational rules for staying in sync between dump refreshes. For the canonical Database Authority Hierarchy (which file is primary, which is secondary, why chunks exist, AI-agent inspection rules), see `docs/shared/reference/DATABASE_TRUTH.md` — that file is authoritative if anything below conflicts with it.

## Authority Model

1. Primary authority for schema/object metadata (tables, columns, types, constraints, indexes, views, functions/RPCs, triggers, RLS, policies, grants):
- supabase/backups/full_metadata.sql

2. Primary authority for row data, seed/lookup/master data, and complete database evidence:
- local_folder/backups/full_database.sql

3. If direct file reads of full_database.sql are blocked due to size limits, use exact mirror chunks:
- local_folder/backups/chunks/full_database.sql.part_*

4. Between dump refreshes, use composite operational truth:
- authoritative dump snapshots (metadata + full database)
- plus migrations/checks already executed and verified, then promoted to:
	- supabase/exec_success_migrations/sql
	- supabase/exec_success_migrations/sql_check

5. When a fresh dump is created, authority collapses back to the new dump snapshot as primary truth.

## Automation Assets

1. Metadata (schema) dump refresh automation:
- scripts/backup-metadata.sh

2. Full database dump + chunk mirror refresh automation:
- scripts/backup-full-db.sh
- (scripts/refresh_authoritative_dump.sh still works — it now just calls scripts/backup-full-db.sh for backward compatibility)

3. Verified migration promotion automation:
- scripts/promote_verified_migration.sh

4. Evidence files maintained automatically:
- supabase/evidence/authoritative_metadata_manifest.json
- supabase/evidence/authoritative_dump_manifest.json
- supabase/evidence/post_dump_verified_promotions.md
- supabase/evidence/execution_promotion_log.md

## Promotion Rule (Executed + Verified)

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

## Operational Checklist

1. Apply migration in SQL editor.
2. Run SQL checks and verify pass.
3. Promote files to exec_success_migrations.
4. Log evidence.
5. Continue using composite truth until next dump refresh.

## Decision Rules

1. If migration executed+verified and no new dump yet:
- trust model = latest dump + promoted files listed in post_dump_verified_promotions.md

2. If dump is created later:
- scripts/backup-full-db.sh resets post_dump_verified_promotions.md window
- new dump manifest becomes the baseline truth
- subsequent promotions become the new post-dump delta set

## Validation and Promotion Gate

1. SQL checks are manually executed and manually reviewed from shared output.
2. Promotion is performed only after check output is explicitly confirmed as pass.
3. If checks fail, migration/check SQL must be corrected and checks rerun before any promotion.
