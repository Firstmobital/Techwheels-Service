# Supabase Audit Cycle Summary (2026-06-26T12:38:13.502Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38417 total_ms=82898400.68 mean_ms=2157.86

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38417 | 82898400.68 | 2157.86 |
| -5344960703026327435 | 6953 | 14929500.11 | 2147.20 |
| -6712128630152386476 | 5106 | 9985405.38 | 1955.62 |
| -225245605736690330 | 3345 | 4437730.84 | 1326.68 |
| -5044213774447814878 | 3056 | 3907298.51 | 1278.57 |
| -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 3220864789079889211 | 4586 | 3327527.44 | 725.58 |
| -2647655532108368607 | 4495 | 3050965.97 | 678.75 |
| 852176900607336119 | 2358 | 2724583.53 | 1155.46 |
| 7336725908253715888 | 6004 | 2718350.56 | 452.76 |

## Platform Logs

- auth: status=ok, count=3
- edge_functions: status=ok, count=77
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=9

## Run Comparison

- Previous run: 2026-06-26__06-03-50-248Z
- Movement status: regressed
- Delta total_ms sum: 2381491.74
- Delta calls sum: 14517

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 230 | 693761.4 |
| 4251000708073776526 | 867 | 279371.01 |
| 3220864789079889211 | 395 | 264132.15 |
| -225245605736690330 | 110 | 215129.62 |
| 7336725908253715888 | 174 | 145403.94 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 2381491.74

## DB Health

- postgres: commits=4322697, rollbacks=341820, blks_hit_ratio_pct=100.00, deadlocks=0

## Performance KPIs

- slow_queries_total_time_gt_1000=967, cache_hit_rate_pct=100.00, avg_rows_per_call=10.23

## Connection Snapshot

- total_connections=18, active_connections=3, idle_connections=13, waiting_connections=16, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=9
