# Supabase Audit Cycle Summary (2026-06-26T05:14:44.515Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38417 total_ms=82898400.68 mean_ms=2157.86

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38417 | 82898400.68 | 2157.86 |
| -5344960703026327435 | 6691 | 14146203.89 | 2114.21 |
| -6712128630152386476 | 5106 | 9985405.38 | 1955.62 |
| -225245605736690330 | 3216 | 4192966.80 | 1303.78 |
| -5044213774447814878 | 3056 | 3907298.51 | 1278.57 |
| -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 3220864789079889211 | 4142 | 3039307.33 | 733.78 |
| -2647655532108368607 | 4360 | 2909283.55 | 667.27 |
| -922008049376959953 | 2257 | 2638989.76 | 1169.25 |
| 852176900607336119 | 2259 | 2638492.51 | 1167.99 |

## Platform Logs

- auth: status=ok, count=0
- edge_functions: status=ok, count=67
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=3

## Run Comparison

- Previous run: 2026-06-26__04-51-30-388Z
- Movement status: regressed
- Delta total_ms sum: 159997.82
- Delta calls sum: 889

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 23 | 68267.76 |
| 3787216458397661678 | 36 | 17038.27 |
| -225245605736690330 | 7 | 11505.89 |
| 3220864789079889211 | 23 | 11074.39 |
| 4251000708073776526 | 53 | 9882.66 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 159997.82

## DB Health

- postgres: commits=4266477, rollbacks=330141, blks_hit_ratio_pct=100.00, deadlocks=0

## Performance KPIs

- slow_queries_total_time_gt_1000=930, cache_hit_rate_pct=100.00, avg_rows_per_call=10.30

## Connection Snapshot

- total_connections=25, active_connections=6, idle_connections=17, waiting_connections=20, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=3
