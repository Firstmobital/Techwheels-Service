# Supabase Audit Cycle Summary (2026-07-22T11:44:29.065Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query -2876120296317350531 calls=520961 total_ms=5750354.02 mean_ms=11.04

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| -2876120296317350531 | 520961 | 5750354.02 | 11.04 |
| 852176900607336119 | 2603 | 4240996.88 | 1629.27 |
| 7336725908253715888 | 2583 | 2279905.15 | 882.66 |
| 8843009277484467611 | 298 | 1202470.16 | 4035.13 |
| -397576279058981298 | 408 | 1184667.40 | 2903.60 |
| -1851842182524549347 | 12500 | 1145742.07 | 91.66 |
| -6279881906384027513 | 882 | 1116899.51 | 1266.33 |
| 3787216458397661678 | 3073 | 1018516.84 | 331.44 |
| 8976932172498995662 | 5727 | 915045.41 | 159.78 |
| -8535248155740750540 | 148 | 827420.34 | 5590.68 |

## Platform Logs

- auth: status=ok, count=0
- edge_functions: status=ok, count=5
- realtime: status=ok, count=7
- storage: status=ok, count=4
- database_health: status=ok, count=0

## Run Comparison

- Previous run: 2026-07-22__09-13-27-494Z
- Movement status: regressed
- Delta total_ms sum: 1328716.34
- Delta calls sum: 16196

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 3833171277786028740 | 3351 | 405610.55 |
| -2876120296317350531 | 16674 | 302878.68 |
| -2647655532108368607 | 82 | 206536.5 |
| 4706629092485339489 | 4822 | 121897.12 |
| 852176900607336119 | 70 | 114163.12 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 1328716.34

## DB Health

- postgres: commits=9039939, rollbacks=900748, blks_hit_ratio_pct=99.99, deadlocks=2

## Performance KPIs

- slow_queries_total_time_gt_1000=495, cache_hit_rate_pct=99.99, avg_rows_per_call=3.08

## Connection Snapshot

- total_connections=39, active_connections=19, idle_connections=13, waiting_connections=16, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=0

## Top Postgres Errors & Warnings (Ranked by Frequency)

- No errors/warnings captured or log query unavailable.

## Top Edge Function Errors (Ranked by Frequency)

- No edge function errors captured or log query unavailable.
