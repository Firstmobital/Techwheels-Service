# Supabase Audit Cycle Summary (2026-07-07T06:14:46.119Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6462467893367818088 calls=214 total_ms=481857.01 mean_ms=2251.67

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6462467893367818088 | 214 | 481857.01 | 2251.67 |
| 852176900607336119 | 510 | 402903.53 | 790.01 |
| 3220864789079889211 | 167 | 317285.99 | 1899.92 |
| -2876120296317350531 | 24357 | 221571.48 | 9.10 |
| -3550207178760076775 | 300 | 218608.98 | 728.70 |
| 8843009277484467611 | 56 | 210838.84 | 3764.98 |
| -1851842182524549347 | 2583 | 166946.78 | 64.63 |
| 7336725908253715888 | 463 | 147264.16 | 318.07 |
| -397576279058981298 | 57 | 137508.01 | 2412.42 |
| -2647655532108368607 | 166 | 123757.56 | 745.53 |

## Platform Logs

- auth: status=ok, count=0
- edge_functions: status=ok, count=40
- realtime: status=ok, count=0
- storage: status=ok, count=1
- database_health: status=ok, count=28

## Run Comparison

- Previous run: 2026-07-06__08-13-13-489Z
- Movement status: regressed
- Delta total_ms sum: 3425053.57
- Delta calls sum: 48439

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 6462467893367818088 | 212 | 475741.16 |
| 852176900607336119 | 503 | 396781.32 |
| 3220864789079889211 | 145 | 286193.14 |
| -2876120296317350531 | 24357 | 221571.48 |
| -3550207178760076775 | 292 | 208420.52 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 3425053.57

## DB Health

- postgres: commits=5895843, rollbacks=546052, blks_hit_ratio_pct=99.99, deadlocks=1

## Performance KPIs

- slow_queries_total_time_gt_1000=200, cache_hit_rate_pct=99.99, avg_rows_per_call=3.80

## Connection Snapshot

- total_connections=24, active_connections=3, idle_connections=19, waiting_connections=23, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=28
