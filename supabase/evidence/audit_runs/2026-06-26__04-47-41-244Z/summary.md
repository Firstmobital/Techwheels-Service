# Supabase Audit Cycle Summary (2026-06-26T04:47:41.244Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38414 total_ms=82890843.76 mean_ms=2157.83

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38414 | 82890843.76 | 2157.83 |
| -5344960703026327435 | 6665 | 14067554.50 | 2110.66 |
| -6712128630152386476 | 5106 | 9985405.38 | 1955.62 |
| -225245605736690330 | 3209 | 4181460.91 | 1303.04 |
| -5044213774447814878 | 3056 | 3907298.51 | 1278.57 |
| -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 3220864789079889211 | 4115 | 3026223.66 | 735.41 |
| -2647655532108368607 | 4354 | 2905669.41 | 667.36 |
| -922008049376959953 | 2254 | 2638086.09 | 1170.40 |
| 852176900607336119 | 2242 | 2623870.19 | 1170.33 |

## Platform Logs

- auth: status=ok, count=3
- edge_functions: status=ok, count=61
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=4

## Run Comparison

- Previous run: 2026-06-26__04-33-21-433Z
- Movement status: regressed
- Delta total_ms sum: 56778.05
- Delta calls sum: 537

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 9 | 23390.71 |
| 3787216458397661678 | 14 | 7823.84 |
| 3220864789079889211 | 14 | 6476.55 |
| -225245605736690330 | 5 | 4784.38 |
| 852176900607336119 | 5 | 3626.11 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 56778.05

## DB Health

- postgres: commits=4263262, rollbacks=330081, blks_hit_ratio_pct=100.00, deadlocks=0

## Performance KPIs

- slow_queries_total_time_gt_1000=949, cache_hit_rate_pct=100.00, avg_rows_per_call=10.36

## Connection Snapshot

- total_connections=29, active_connections=7, idle_connections=20, waiting_connections=23, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=4
