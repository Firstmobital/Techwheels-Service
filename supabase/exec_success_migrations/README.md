# Executed Success Migrations Archive

Purpose: Store SQL migration files that have already been executed successfully in Supabase SQL Editor.

## Rule

- After a migration is successfully executed and verified, move the SQL file from supabase/migrations to this folder.
- Keep the original timestamp prefix in the filename.
- Do not rename files after execution.

## Required Tracking Before Move

1. Update docs/Project_Handbook/DB_CHANGE_LEDGER.md status to VERIFIED.
2. Record execution evidence (timestamp, environment, validation result).
3. Confirm docs sync updates are completed.

## Naming

Keep migration filenames exactly as originally created, for example:

20260523120000_add_module_permission_helper_functions.sql
