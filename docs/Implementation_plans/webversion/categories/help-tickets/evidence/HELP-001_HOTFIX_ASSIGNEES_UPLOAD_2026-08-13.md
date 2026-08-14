# HELP-001 Hotfix — Assignees include admins + upload dealer path

**Date:** 2026-08-13  
**Status:** ✅ Migration applied + Vercel deployed  
**Pending:** Refresh `supabase/backups/full_metadata.sql` so dump matches prod

## Root causes

1. **Assign dropdown:** `help_ticket_list_assignees` required `user_employee_links` + `employee_master`. Unlinked admins (synthetic `ADMIN:{uuid}`) were excluded despite `is_admin()` bypass elsewhere.
2. **Upload failed:** client lowercased dealer prefix / fell back to `shared`, but autodoc storage RLS requires `split_part(path,'/',1) = my_dealer_code()` (case-sensitive).

## Applied

| Piece | Artifact |
|---|---|
| SQL | `supabase/migrations/20260813104500_help_ticket_assignees_include_admins.sql` |
| Web upload | `src/lib/helpTicketUpload.ts` — uses `my_dealer_code()` exactly |
| Mobile upload | `mobile/src/lib/api/helpTicketUpload.ts` — same |
| UI | Admin + employee detail show attachments / `error_message` |

## Smoke

1. `/help-tickets` Assign to… lists Admin + all `help_tickets` can_modify holders
2. Assign/escalate to Admin succeeds
3. Re-upload attachment on a ticket → status `uploaded` + Drive link (not `upload_failed`)
