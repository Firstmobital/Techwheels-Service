# Supabase Audit Cycle Summary (2026-07-21T09:05:34.309Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query -2876120296317350531 calls=428389 total_ms=4758262.51 mean_ms=11.11

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| -2876120296317350531 | 428389 | 4758262.51 | 11.11 |
| 852176900607336119 | 2177 | 3520775.86 | 1617.26 |
| 7336725908253715888 | 2483 | 2182841.66 | 879.11 |
| -1851842182524549347 | 10418 | 1017136.51 | 97.63 |
| -397576279058981298 | 343 | 985218.63 | 2872.36 |
| 8843009277484467611 | 245 | 980010.43 | 4000.04 |
| -6279881906384027513 | 719 | 885173.73 | 1231.12 |
| 3787216458397661678 | 2224 | 826378.14 | 371.57 |
| -8535248155740750540 | 123 | 673873.49 | 5478.65 |
| 4198387656238320733 | 332 | 654709.23 | 1972.02 |

## Platform Logs

- auth: status=ok, count=5
- edge_functions: status=ok, count=80
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=5

## Run Comparison

- Previous run: 2026-07-21__08-36-07-070Z
- Movement status: regressed
- Delta total_ms sum: 920265.31
- Delta calls sum: 3570

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -2876120296317350531 | 2250 | 599278.73 |
| 7336725908253715888 | 66 | 102357.46 |
| 852176900607336119 | 22 | 54318.58 |
| 8976932172498995662 | 62 | 37402.85 |
| -5344960703026327435 | 13 | 21636.53 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 920265.31

## DB Health

- postgres: commits=8773287, rollbacks=879632, blks_hit_ratio_pct=99.99, deadlocks=2

## Performance KPIs

- slow_queries_total_time_gt_1000=409, cache_hit_rate_pct=99.99, avg_rows_per_call=2.41

## Connection Snapshot

- total_connections=29, active_connections=8, idle_connections=19, waiting_connections=23, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=5

## Top Postgres Errors & Warnings (Ranked by Frequency)

- No errors/warnings captured or log query unavailable.

## Top Edge Function Errors (Ranked by Frequency)

- No edge function errors captured or log query unavailable.
