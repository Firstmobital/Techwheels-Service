# HELP-001 Hotfix — Categories + Admin identity

**Date:** 2026-08-11  
**Symptom:** Prod `/help/tickets` → Failed to load tickets; `/help/tickets/new` → Failed to load categories (Admin 3001440)

## Root cause

1. `help_ticket_list_categories` called `help_ticket_require_employee()`, which raises **Employee link required** when `my_employee_code()` is null (common for Admin users without `user_employee_links`).
2. Same gate blocked `help_ticket_list_mine` / create for those admins.
3. Category catalog needed an idempotent re-seed for Service domains.

## Fix migration

`supabase/migrations/20260811123000_help_tickets_categories_seed_and_admin_identity.sql`

- Seeds/updates 19 Service-oriented categories (`ON CONFLICT DO UPDATE`)
- `help_ticket_list_categories`: auth only
- `help_ticket_require_employee`: if no employee link and `is_admin()`, use `ADMIN:{uuid}` identity

## Apply

Run the migration against the live project, redeploy web (Vercel) for clearer error strings, then hard-refresh.
