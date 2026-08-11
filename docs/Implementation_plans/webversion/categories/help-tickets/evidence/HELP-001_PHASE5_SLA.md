# HELP-001 Phase 5 — SLA cron + hardening

**Date:** 2026-08-11  
**Status:** ✅ Applied + Vercel deployed + ACL hotfix verified in `full_metadata.sql`

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

## Verification (2026-08-11)

- [x] Migration applied in Supabase
- [x] Vercel deployment includes admin SLA badge / notification labels
- [x] Fresh dump `supabase/backups/full_metadata.sql` contains:
  - `check_help_ticket_sla_breaches(integer)`
  - `auto_close_unverified_help_tickets(integer, integer)`
  - `run_help_ticket_sla_jobs()`
  - columns `sla_response_breached_at` / `sla_resolution_breached_at`
  - indexes `idx_help_tickets_sla_response` / `idx_help_tickets_auto_close`

### ACL (verified after hotfix)

`20260811141500_help_ticket_sla_jobs_revoke_client_execute.sql` applied.  
Dump ACLs for all three maintenance RPCs:

- `REVOKE ALL … FROM PUBLIC`
- `GRANT ALL … TO service_role` only  
- **No** `anon` / `authenticated` grants

## Checks

`supabase/sql_checks/20260811140000_help_ticket_sla_cron_and_auto_close_checks.sql`

## UI

- Admin inbox shows **SLA** pill when either breach timestamp is set
- Detail meta shows paused / response / resolution breach hints
- TopNav already labels `sla_breached` events (Phase 3)
