# Supabase Audit Cycle Summary (2026-07-22T09:13:27.494Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query -2876120296317350531 calls=504287 total_ms=5447475.34 mean_ms=10.80

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| -2876120296317350531 | 504287 | 5447475.34 | 10.80 |
| 852176900607336119 | 2533 | 4126833.76 | 1629.23 |
| 7336725908253715888 | 2583 | 2279905.15 | 882.66 |
| 8843009277484467611 | 284 | 1139229.10 | 4011.37 |
| -397576279058981298 | 395 | 1137079.70 | 2878.68 |
| -1851842182524549347 | 12170 | 1117741.31 | 91.84 |
| -6279881906384027513 | 844 | 1068276.02 | 1265.73 |
| 3787216458397661678 | 2818 | 973523.08 | 345.47 |
| 8976932172498995662 | 5521 | 870260.83 | 157.63 |
| -8535248155740750540 | 148 | 827420.34 | 5590.68 |

## Platform Logs

- auth: status=ok, count=4
- edge_functions: status=ok, count=100
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=4

## Run Comparison

- Previous run: 2026-07-22__07-32-07-447Z
- Movement status: regressed
- Delta total_ms sum: 808581.62
- Delta calls sum: 16264

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -2647655532108368607 | 241 | 403485.44 |
| -2876120296317350531 | 11633 | 130438.76 |
| 852176900607336119 | 90 | 113779.95 |
| 8976932172498995662 | 581 | 60261.32 |
| -8535248155740750540 | 7 | 44389.72 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 808581.62

## DB Health

- postgres: commits=8987052, rollbacks=900501, blks_hit_ratio_pct=99.99, deadlocks=2

## Performance KPIs

- slow_queries_total_time_gt_1000=461, cache_hit_rate_pct=99.99, avg_rows_per_call=2.98

## Connection Snapshot

- total_connections=24, active_connections=3, idle_connections=19, waiting_connections=22, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=4

## Top Postgres Errors & Warnings (Ranked by Frequency)

- No errors/warnings captured or log query unavailable.

## Top Edge Function Errors (Ranked by Frequency)

- No edge function errors captured or log query unavailable.
