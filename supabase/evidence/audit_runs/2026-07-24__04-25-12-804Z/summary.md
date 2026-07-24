# Supabase Audit Cycle Summary (2026-07-24T04:25:12.804Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query -2876120296317350531 calls=653128 total_ms=6737768.55 mean_ms=10.32

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| -2876120296317350531 | 653128 | 6737768.55 | 10.32 |
| 852176900607336119 | 3045 | 4942688.66 | 1623.21 |
| 7336725908253715888 | 2583 | 2279905.15 | 882.66 |
| 3787216458397661678 | 5015 | 1958886.05 | 390.61 |
| 8843009277484467611 | 377 | 1519547.15 | 4030.63 |
| -397576279058981298 | 491 | 1461289.89 | 2976.15 |
| 8976932172498995662 | 6705 | 1291775.00 | 192.66 |
| -1851842182524549347 | 14445 | 1253049.52 | 86.75 |
| -6279881906384027513 | 980 | 1199939.11 | 1224.43 |
| -2147031708195470770 | 747 | 873721.51 | 1169.64 |

## Platform Logs

- auth: status=ok, count=3
- edge_functions: status=ok, count=100
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=10

## Run Comparison

- Previous run: 2026-07-22__11-44-29-065Z
- Movement status: regressed
- Delta total_ms sum: 5541869.49
- Delta calls sum: 164624

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -2876120296317350531 | 132167 | 987414.53 |
| 3787216458397661678 | 1942 | 940369.21 |
| 852176900607336119 | 442 | 701691.78 |
| -922008049376959953 | 486 | 439780.76 |
| 8976932172498995662 | 978 | 376729.59 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 5541869.49

## DB Health

- postgres: commits=9721208, rollbacks=947016, blks_hit_ratio_pct=99.99, deadlocks=2

## Performance KPIs

- slow_queries_total_time_gt_1000=529, cache_hit_rate_pct=99.99, avg_rows_per_call=3.00

## Connection Snapshot

- total_connections=24, active_connections=3, idle_connections=19, waiting_connections=22, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=10

## Top Postgres Errors & Warnings (Ranked by Frequency)

- No errors/warnings captured or log query unavailable.

## Top Edge Function Errors (Ranked by Frequency)

- No edge function errors captured or log query unavailable.
