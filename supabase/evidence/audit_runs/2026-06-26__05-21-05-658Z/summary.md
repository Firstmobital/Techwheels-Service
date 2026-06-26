# Supabase Audit Cycle Summary (2026-06-26T05:21:05.658Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38417 total_ms=82898400.68 mean_ms=2157.86

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38417 | 82898400.68 | 2157.86 |
| -5344960703026327435 | 6700 | 14170716.68 | 2115.03 |
| -6712128630152386476 | 5106 | 9985405.38 | 1955.62 |
| -225245605736690330 | 3221 | 4201691.93 | 1304.47 |
| -5044213774447814878 | 3056 | 3907298.51 | 1278.57 |
| -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 3220864789079889211 | 4149 | 3042202.94 | 733.24 |
| -2647655532108368607 | 4361 | 2910512.40 | 667.40 |
| 852176900607336119 | 2264 | 2642059.02 | 1166.99 |
| -922008049376959953 | 2258 | 2639240.52 | 1168.84 |

## Platform Logs

- auth: status=ok, count=6
- edge_functions: status=ok, count=100
- realtime: status=ok, count=1
- storage: status=ok, count=3
- database_health: status=ok, count=36

## Run Comparison

- Previous run: 2026-06-26__05-18-08-767Z
- Movement status: regressed
- Delta total_ms sum: 30399.46
- Delta calls sum: 128

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 5 | 10058.54 |
| -225245605736690330 | 3 | 4485.05 |
| 4251000708073776526 | 7 | 4298.96 |
| 3787216458397661678 | 6 | 3317.92 |
| -7861961781374970658 | 4 | 2363.73 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 30399.46

## DB Health

- postgres: commits=4267418, rollbacks=330148, blks_hit_ratio_pct=100.00, deadlocks=0

## Performance KPIs

- slow_queries_total_time_gt_1000=932, cache_hit_rate_pct=100.00, avg_rows_per_call=10.29

## Connection Snapshot

- total_connections=26, active_connections=3, idle_connections=21, waiting_connections=24, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=36
