# Supabase Audit Cycle Summary (2026-06-26T04:30:23.188Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38414 total_ms=82890843.76 mean_ms=2157.83

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38414 | 82890843.76 | 2157.83 |
| -5344960703026327435 | 6654 | 14037784.55 | 2109.68 |
| -6712128630152386476 | 5106 | 9985405.38 | 1955.62 |
| -225245605736690330 | 3202 | 4172183.95 | 1302.99 |
| -5044213774447814878 | 3056 | 3907298.51 | 1278.57 |
| -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 3220864789079889211 | 4098 | 3018048.70 | 736.47 |
| -2647655532108368607 | 4350 | 2903452.88 | 667.46 |
| -922008049376959953 | 2254 | 2638086.09 | 1170.40 |
| 852176900607336119 | 2236 | 2620111.02 | 1171.78 |

## Platform Logs

- auth: status=ok, count=1
- edge_functions: status=ok, count=49
- realtime: status=ok, count=0
- storage: status=ok, count=1
- database_health: status=ok, count=19

## Run Comparison

- Previous run: 2026-06-26__04-24-40-091Z
- Movement status: regressed
- Delta total_ms sum: 37711.57
- Delta calls sum: 217

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 8 | 16124.2 |
| 7336725908253715888 | 12 | 5670.2 |
| -2647655532108368607 | 4 | 3352.85 |
| 4251000708073776526 | 10 | 2386.08 |
| -225245605736690330 | 2 | 2331.75 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 37711.57

## DB Health

- postgres: commits=4260880, rollbacks=330068, blks_hit_ratio_pct=100.00, deadlocks=0

## Performance KPIs

- slow_queries_total_time_gt_1000=948, cache_hit_rate_pct=100.00, avg_rows_per_call=10.36

## Connection Snapshot

- total_connections=20, active_connections=5, idle_connections=13, waiting_connections=17, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=19
