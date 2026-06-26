# Supabase Audit Cycle Summary (2026-06-26T05:18:08.767Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38417 total_ms=82898400.68 mean_ms=2157.86

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38417 | 82898400.68 | 2157.86 |
| -5344960703026327435 | 6695 | 14160658.14 | 2115.11 |
| -6712128630152386476 | 5106 | 9985405.38 | 1955.62 |
| -225245605736690330 | 3218 | 4197206.88 | 1304.29 |
| -5044213774447814878 | 3056 | 3907298.51 | 1278.57 |
| -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 3220864789079889211 | 4146 | 3040489.54 | 733.35 |
| -2647655532108368607 | 4360 | 2909283.55 | 667.27 |
| 852176900607336119 | 2262 | 2640958.26 | 1167.53 |
| -922008049376959953 | 2258 | 2639240.52 | 1168.84 |

## Platform Logs

- auth: status=ok, count=2
- edge_functions: status=ok, count=45
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=3

## Run Comparison

- Previous run: 2026-06-26__05-14-44-515Z
- Movement status: regressed
- Delta total_ms sum: 35403.65
- Delta calls sum: 136

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 4 | 14454.25 |
| 2744925251257801673 | 1 | 7303.65 |
| 3787216458397661678 | 9 | 5141.43 |
| -225245605736690330 | 2 | 4240.08 |
| 852176900607336119 | 3 | 2465.75 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 35403.65

## DB Health

- postgres: commits=4266905, rollbacks=330145, blks_hit_ratio_pct=100.00, deadlocks=0

## Performance KPIs

- slow_queries_total_time_gt_1000=932, cache_hit_rate_pct=100.00, avg_rows_per_call=10.30

## Connection Snapshot

- total_connections=21, active_connections=2, idle_connections=17, waiting_connections=20, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=3
