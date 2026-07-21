# P1-12 / SUPABASE-003 verification (2026-07-21)

Audit run: `supabase/evidence/audit_runs/2026-07-21__09-05-34-309Z` (SUPABASE-001 snapshot **14.40**)

## Applied changes

- `20260721133000` — EV/PV table names in refresh function
- `20260721150000` — `idx_ev_service_history_test_chassis_norm`, `idx_pv_service_history_test_chassis_norm`
- `20260721151000` — refresh SQL uses `h.contact_full_name` (no `to_jsonb`)
- `20260721152000` — queue processor default batch 50, 60s budget; pg_cron command `(50)`

Schema authority: `supabase/backups/full_metadata.sql` (manifest `2026-07-21T09:04:19Z`).

## Audit evidence

1. **Cron:** `raw_platform_postgres_logs.json` — job 24 `process_all_service_history_sync_queue(50)` start + complete.
2. **Errors:** `raw_top_postgres_errors.json` — no ranked postgres ERROR/FATAL/WARNING messages (24h window).
3. **Load:** queryid `3220864789079889211` not in top-10 (`summary.json`) or `raw_tracked_queries.json`.
4. **Smoke at apply:** `process_all_service_history_sync_queue(5)` succeeded; large queue backlog noted for ongoing drain monitoring.

## Closure

- SUPABASE-001 **P1-12** → **Done** (2026-07-21).
- Ongoing: watch queue depth and postgres logs for `57014` on sync path during backlog drain.
