# Supabase Audit Cycle Summary (2026-06-26T04:33:21.433Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38414 total_ms=82890843.76 mean_ms=2157.83

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38414 | 82890843.76 | 2157.83 |
| -5344960703026327435 | 6656 | 14044163.79 | 2110.00 |
| -6712128630152386476 | 5106 | 9985405.38 | 1955.62 |
| -225245605736690330 | 3204 | 4176676.53 | 1303.58 |
| -5044213774447814878 | 3056 | 3907298.51 | 1278.57 |
| -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 3220864789079889211 | 4101 | 3019747.11 | 736.34 |
| -2647655532108368607 | 4351 | 2903735.30 | 667.37 |
| -922008049376959953 | 2254 | 2638086.09 | 1170.40 |
| 852176900607336119 | 2237 | 2620244.08 | 1171.32 |

## Platform Logs

- auth: status=ok, count=0
- edge_functions: status=ok, count=55
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=4

## Run Comparison

- Previous run: 2026-06-26__04-30-23-188Z
- Movement status: regressed
- Delta total_ms sum: 16722.77
- Delta calls sum: 109

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 2 | 6379.24 |
| -225245605736690330 | 2 | 4492.58 |
| 3220864789079889211 | 3 | 1698.41 |
| 4251000708073776526 | 8 | 1223 |
| -7861961781374970658 | 1 | 1065.54 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 16722.77

## DB Health

- postgres: commits=4261306, rollbacks=330070, blks_hit_ratio_pct=100.00, deadlocks=0

## Performance KPIs

- slow_queries_total_time_gt_1000=949, cache_hit_rate_pct=100.00, avg_rows_per_call=10.36

## Connection Snapshot

- total_connections=20, active_connections=2, idle_connections=16, waiting_connections=19, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=4
