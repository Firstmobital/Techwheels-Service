# Supabase migrations

Only keep incremental timestamped migration files in this folder (for example: `20260513020000_add_parts_order_dealer_code_compat.sql`).

For every migration created here, also create a paired read-only verification file in:

- `supabase/sql_checks/`

Use the same timestamp prefix and add `_checks.sql` suffix.

After a migration is executed successfully in Supabase SQL Editor and verified, move that SQL file to:

- `supabase/exec_success_migrations/`

This keeps `supabase/migrations/` focused on pending-to-apply files only.

Do **not** keep full schema/data dump files here because they can be executed as active migrations and cause drift/conflicts.

- Canonical authoritative dump for this repo is:

- `local_folder/backups/full_database.sql`

- For large-file reads, use chunk files:

- `local_folder/backups/chunks/full_database.sql.part_*`

- Historical fallback/reference dump (not canonical authority) is kept at:

- `supabase/backups/full_dump.sql`
