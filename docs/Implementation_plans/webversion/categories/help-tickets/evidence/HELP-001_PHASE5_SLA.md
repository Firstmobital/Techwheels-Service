# HELP-001 Phase 5 — SLA cron + hardening

**Date:** 2026-08-11  
**Status:** Migration authored — apply SQL + run checks + refresh metadata

## Migration

`supabase/migrations/20260811140000_help_ticket_sla_cron_and_auto_close.sql`

| Piece | Detail |
|---|---|
| Columns | `help_tickets.sla_response_breached_at`, `sla_resolution_breached_at` |
| `check_help_ticket_sla_breaches(limit)` | Pause-aware (`sla_paused` / `on_hold` / `waiting_raiser`); audit + `sla_breached` notifications to support holders |
| `auto_close_unverified_help_tickets(limit, grace_days)` | After 7 days in `resolved`/`cannot_reproduce` with `verification_status=pending` → `closed` + `auto_closed` |
| `run_help_ticket_sla_jobs()` | Cron wrapper |
| Schedule | `help-ticket-sla-jobs` every 15 minutes via `pg_cron` (skipped if extension missing) |
| Grants | `postgres` + `service_role` only (revoked from `PUBLIC` / not granted to `authenticated`) |

## Checks

`supabase/sql_checks/20260811140000_help_ticket_sla_cron_and_auto_close_checks.sql`

Expect:
- columns present
- SECURITY DEFINER functions present
- `authenticated` cannot EXECUTE maintenance RPCs
- no `my_dealer_code()` in help-ticket visibility / SLA functions
- cron job registered when `pg_cron` installed
- `SELECT public.run_help_ticket_sla_jobs()` returns `ok: true`

## UI

- Admin inbox shows **SLA** pill when either breach timestamp is set
- Detail meta shows paused / response / resolution breach hints
- TopNav already labels `sla_breached` events (Phase 3)

## Apply steps

1. Run migration SQL in Supabase
2. Run sql_checks file
3. Refresh `supabase/backups/full_metadata.sql`
4. Redeploy Vercel for admin SLA badge (optional but recommended)
5. Smoke: hold a ticket → confirm job does not mark breach; resolve + backdate `resolved_at` → auto-close
