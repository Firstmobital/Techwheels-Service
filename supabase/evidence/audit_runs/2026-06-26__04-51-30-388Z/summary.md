# Supabase Audit Cycle Summary (2026-06-26T04:51:30.388Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38414 total_ms=82890843.76 mean_ms=2157.83

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38414 | 82890843.76 | 2157.83 |
| -5344960703026327435 | 6668 | 14077936.13 | 2111.27 |
| -6712128630152386476 | 5106 | 9985405.38 | 1955.62 |
| -225245605736690330 | 3209 | 4181460.91 | 1303.04 |
| -5044213774447814878 | 3056 | 3907298.51 | 1278.57 |
| -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 3220864789079889211 | 4119 | 3028232.94 | 735.19 |
| -2647655532108368607 | 4356 | 2906811.79 | 667.31 |
| -922008049376959953 | 2254 | 2638086.09 | 1170.40 |
| 852176900607336119 | 2247 | 2630600.07 | 1170.72 |

## Platform Logs

- auth: status=ok, count=0
- edge_functions: status=ok, count=67
- realtime: status=ok, count=0
- storage: status=ok, count=1
- database_health: status=ok, count=21

## Run Comparison

- Previous run: 2026-06-26__04-47-41-244Z
- Movement status: regressed
- Delta total_ms sum: 29937.12
- Delta calls sum: 137

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 3 | 10381.63 |
| 852176900607336119 | 5 | 6729.88 |
| 3787216458397661678 | 12 | 6690.97 |
| 3220864789079889211 | 4 | 2009.28 |
| -3076875962393720596 | 2 | 1992.46 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 29937.12

## DB Health

- postgres: commits=4263714, rollbacks=330085, blks_hit_ratio_pct=100.00, deadlocks=0

## Performance KPIs

- slow_queries_total_time_gt_1000=949, cache_hit_rate_pct=100.00, avg_rows_per_call=10.36

## Connection Snapshot

- total_connections=25, active_connections=3, idle_connections=20, waiting_connections=23, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=21
