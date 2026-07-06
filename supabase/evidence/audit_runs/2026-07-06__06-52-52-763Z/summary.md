# Supabase Audit Cycle Summary (2026-07-06T06:52:52.763Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38443 total_ms=82957961.50 mean_ms=2157.95

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38443 | 82957961.50 | 2157.95 |
| -5344960703026327435 | 11096 | 26799598.19 | 2415.25 |
| 3220864789079889211 | 18636 | 12627020.33 | 677.56 |
| -6712128630152386476 | 5109 | 9998334.10 | 1957.00 |
| 4251000708073776526 | 26074 | 6663342.68 | 255.56 |
| -225245605736690330 | 4549 | 6046027.75 | 1329.09 |
| 7336725908253715888 | 11510 | 5506028.06 | 478.37 |
| 6462467893367818088 | 1933 | 4587091.41 | 2373.04 |
| -2647655532108368607 | 5441 | 3942087.41 | 724.52 |
| -5044213774447814878 | 3062 | 3913485.36 | 1278.08 |

## Platform Logs

- auth: status=ok, count=2
- edge_functions: status=ok, count=51
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=8

## Run Comparison

- Previous run: 2026-06-26__12-38-13-502Z
- Movement status: regressed
- Delta total_ms sum: 43800535.28
- Delta calls sum: 217481

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 4143 | 11870098.08 |
| 3220864789079889211 | 14050 | 9299492.89 |
| 4251000708073776526 | 20071 | 5489359.98 |
| 6462467893367818088 | 1933 | 4587091.41 |
| 7336725908253715888 | 5506 | 2787677.5 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 43800535.28

## DB Health

- postgres: commits=5737528, rollbacks=527148, blks_hit_ratio_pct=99.99, deadlocks=0

## Performance KPIs

- slow_queries_total_time_gt_1000=1117, cache_hit_rate_pct=100.00, avg_rows_per_call=8.23

## Connection Snapshot

- total_connections=30, active_connections=3, idle_connections=24, waiting_connections=29, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=8
