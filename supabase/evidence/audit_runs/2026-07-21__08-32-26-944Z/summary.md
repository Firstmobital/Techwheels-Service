# Supabase Audit Cycle Summary (2026-07-21T08:32:26.944Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query -2876120296317350531 calls=425906 total_ms=4056208.79 mean_ms=9.52

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| -2876120296317350531 | 425906 | 4056208.79 | 9.52 |
| 852176900607336119 | 2155 | 3466457.28 | 1608.56 |
| 7336725908253715888 | 2417 | 2080484.20 | 860.77 |
| -1851842182524549347 | 10311 | 1000543.20 | 97.04 |
| -397576279058981298 | 343 | 985218.63 | 2872.36 |
| 8843009277484467611 | 242 | 967197.69 | 3996.68 |
| -6279881906384027513 | 717 | 878345.16 | 1225.03 |
| 3787216458397661678 | 2207 | 810548.79 | 367.26 |
| 4198387656238320733 | 332 | 654709.23 | 1972.02 |
| -8535248155740750540 | 120 | 654458.65 | 5453.82 |

## Platform Logs

- auth: status=ok, count=17
- edge_functions: status=ok, count=100
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=2

## Run Comparison

- Previous run: 2026-07-21__08-09-21-622Z
- Movement status: regressed
- Delta total_ms sum: 378782.23
- Delta calls sum: 1836

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -2876120296317350531 | 958 | 287642.83 |
| -8535248155740750540 | 3 | 18469.25 |
| 852176900607336119 | 8 | 16849.75 |
| -6279881906384027513 | 5 | 7700.98 |
| 4706629092485339489 | 728 | 6899.41 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 378782.23

## DB Health

- postgres: commits=8765249, rollbacks=879581, blks_hit_ratio_pct=99.99, deadlocks=2

## Performance KPIs

- slow_queries_total_time_gt_1000=404, cache_hit_rate_pct=99.99, avg_rows_per_call=2.36

## Connection Snapshot

- total_connections=25, active_connections=9, idle_connections=14, waiting_connections=15, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=2

## Top Postgres Errors & Warnings (Ranked by Frequency)

- No errors/warnings captured or log query unavailable.

## Top Edge Function Errors (Ranked by Frequency)

- No edge function errors captured or log query unavailable.
