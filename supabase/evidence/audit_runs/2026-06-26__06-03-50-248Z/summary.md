# Supabase Audit Cycle Summary (2026-06-26T06:03:50.248Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38417 total_ms=82898400.68 mean_ms=2157.86

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38417 | 82898400.68 | 2157.86 |
| -5344960703026327435 | 6723 | 14235738.71 | 2117.47 |
| -6712128630152386476 | 5106 | 9985405.38 | 1955.62 |
| -225245605736690330 | 3235 | 4222601.22 | 1305.29 |
| -5044213774447814878 | 3056 | 3907298.51 | 1278.57 |
| -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 3220864789079889211 | 4191 | 3063395.29 | 730.95 |
| -2647655532108368607 | 4376 | 2921432.41 | 667.60 |
| 852176900607336119 | 2283 | 2658642.59 | 1164.54 |
| -922008049376959953 | 2262 | 2640077.59 | 1167.14 |

## Platform Logs

- auth: status=ok, count=4
- edge_functions: status=ok, count=67
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=8

## Run Comparison

- Previous run: 2026-06-26__05-21-05-658Z
- Movement status: regressed
- Delta total_ms sum: 237967
- Delta calls sum: 1629

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 23 | 65022.03 |
| 3787216458397661678 | 54 | 29160.41 |
| 2744925251257801673 | 4 | 24362.71 |
| 3220864789079889211 | 42 | 21192.35 |
| -225245605736690330 | 14 | 20909.29 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 237967

## DB Health

- postgres: commits=4272798, rollbacks=330225, blks_hit_ratio_pct=100.00, deadlocks=0

## Performance KPIs

- slow_queries_total_time_gt_1000=942, cache_hit_rate_pct=100.00, avg_rows_per_call=10.30

## Connection Snapshot

- total_connections=28, active_connections=4, idle_connections=22, waiting_connections=25, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=8
