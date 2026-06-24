# Executed Success Migrations Archive

Purpose: Store SQL migration files that have already been executed successfully in Supabase SQL Editor.

## Rule

- After a migration is successfully executed and verified, move the SQL file from supabase/migrations to this folder's sql/ subfolder.
- Move its matching verification SQL from supabase/sql_checks to this folder's sql_check/ subfolder in the same promotion step.
- Keep the original timestamp prefix in the filename.
- Do not rename files after execution.

## Structure

- supabase/exec_success_migrations/sql/ -> executed migration SQL files
- supabase/exec_success_migrations/sql_check/ -> executed verification SQL check files

## Automation

1. Refresh authoritative dump + chunk mirror and reset post-dump promotion window:

```bash
scripts/refresh_authoritative_dump.sh
```

2. Promote one verified migration bundle (migration + checks):

```bash
scripts/promote_verified_migration.sh <timestamp_prefix> --with-checks
```

## Required Tracking Before Move

1. Update docs/Project_Handbook/DB_CHANGE_LEDGER.md status to VERIFIED.
2. Record execution evidence (timestamp, environment, validation result).
3. Confirm docs sync updates are completed.
4. Follow docs/shared/reference/DB_TRUTH_PROTOCOL.md for authority resolution between dump refreshes.

## Naming

Keep migration filenames exactly as originally created, for example:

20260523120000_add_module_permission_helper_functions.sql
