# SQL Verification Checks

Purpose: Hold temporary read-only post-migration verification scripts paired with each migration.

## Rule

- For every file in supabase/migrations, create a matching read-only check file in supabase/sql_checks.
- Use the same timestamp prefix as the migration.
- Checks must be SELECT-only (no INSERT/UPDATE/DELETE/DDL).
- Operator runs checks after applying migration and shares output.
- After output review, ledger status is updated to VERIFIED and migration can be archived.
- After verification evidence is recorded in ledger/docs, delete the check SQL file to avoid folder pile-up.

## Naming

Migration:
- supabase/migrations/20260523120000_descriptive_migration_name.sql

Check file:
- supabase/sql_checks/20260523120000_descriptive_migration_name_checks.sql
