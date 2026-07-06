# Supabase Audit Cycle Summary (2026-07-06T08:13:13.489Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 3220864789079889211 calls=22 total_ms=31092.85 mean_ms=1413.31

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 3220864789079889211 | 22 | 31092.85 | 1413.31 |
| -3550207178760076775 | 8 | 10188.46 | 1273.56 |
| -6279881906384027513 | 4 | 6246.93 | 1561.73 |
| 852176900607336119 | 7 | 6122.21 | 874.60 |
| 6462467893367818088 | 2 | 6115.85 | 3057.93 |
| -2647655532108368607 | 12 | 6025.22 | 502.10 |
| 8843009277484467611 | 1 | 3848.71 | 3848.71 |
| 4198387656238320733 | 1 | 2472.53 | 2472.53 |
| -2722561837642443195 | 32 | 2307.79 | 72.12 |
| 7306672297351416794 | 27 | 1834.61 | 67.95 |

## Platform Logs

- auth: status=ok, count=12
- edge_functions: status=ok, count=100
- realtime: status=ok, count=1
- storage: status=ok, count=4
- database_health: status=ok, count=17

## Run Comparison

- Previous run: 2026-07-06__07-42-05-165Z
- Movement status: improved
- Delta total_ms sum: -198283995.58
- Delta calls sum: -1104808

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -3550207178760076775 | 8 | 10188.46 |
| -6279881906384027513 | 4 | 6246.93 |
| 4198387656238320733 | 1 | 2472.53 |
| -2722561837642443195 | 32 | 2307.79 |
| 7306672297351416794 | 27 | 1834.61 |

## Regression Guard

- status: ok
- warn_triggered: false
- block_triggered: false
- delta_total_ms_sum: -198283995.58

## DB Health

- postgres: commits=5749360, rollbacks=527220, blks_hit_ratio_pct=99.99, deadlocks=0

## Performance KPIs

- slow_queries_total_time_gt_1000=18, cache_hit_rate_pct=100.00, avg_rows_per_call=1.27

## Connection Snapshot

- total_connections=26, active_connections=10, idle_connections=14, waiting_connections=19, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=17
