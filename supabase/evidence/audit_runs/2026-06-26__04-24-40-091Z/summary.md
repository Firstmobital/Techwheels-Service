# Supabase Audit Cycle Summary (2026-06-26T04:24:40.091Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38414 total_ms=82890843.76 mean_ms=2157.83

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38414 | 82890843.76 | 2157.83 |
| -5344960703026327435 | 6646 | 14021660.35 | 2109.79 |
| -6712128630152386476 | 5106 | 9985405.38 | 1955.62 |
| -225245605736690330 | 3200 | 4169852.20 | 1303.08 |
| -5044213774447814878 | 3056 | 3907298.51 | 1278.57 |
| -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 3220864789079889211 | 4092 | 3016169.57 | 737.09 |
| -2647655532108368607 | 4346 | 2900100.03 | 667.30 |
| -922008049376959953 | 2254 | 2638086.09 | 1170.40 |
| 852176900607336119 | 2234 | 2619288.95 | 1172.47 |

## Platform Logs

- auth: status=ok, count=2
- edge_functions: status=ok, count=0
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=14

## Run Comparison

- Previous run: 2026-06-26__04-24-15-532Z
- Movement status: regressed
- Delta total_ms sum: 3689.1
- Delta calls sum: 19

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 1 | 3663.13 |
| 4706629092485339489 | 18 | 25.97 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 3689.1

## DB Health

- postgres: commits=4260053, rollbacks=330066, blks_hit_ratio_pct=100.00, deadlocks=0

## Performance KPIs

- slow_queries_total_time_gt_1000=948, cache_hit_rate_pct=100.00, avg_rows_per_call=10.37

## Connection Snapshot

- total_connections=27, active_connections=4, idle_connections=21, waiting_connections=25, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=14
