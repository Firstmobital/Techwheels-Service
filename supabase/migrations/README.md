# Supabase migrations

Only keep incremental timestamped migration files in this folder (for example: `20260513020000_add_parts_order_dealer_code_compat.sql`).

Do **not** keep full schema/data dump files here because they can be executed as active migrations and cause drift/conflicts.

The previous full dump has been moved to:

- `supabase/backups/full_dump.sql`
