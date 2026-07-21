# Supabase Audit Cycle Summary (2026-07-21T08:09:21.622Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query -2876120296317350531 calls=424948 total_ms=3768565.96 mean_ms=8.87

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| -2876120296317350531 | 424948 | 3768565.96 | 8.87 |
| 852176900607336119 | 2147 | 3449607.53 | 1606.71 |
| 7336725908253715888 | 2417 | 2080484.20 | 860.77 |
| -1851842182524549347 | 10272 | 996709.59 | 97.03 |
| -397576279058981298 | 341 | 984932.74 | 2888.37 |
| 8843009277484467611 | 241 | 962335.91 | 3993.10 |
| -6279881906384027513 | 712 | 870644.18 | 1222.81 |
| 3787216458397661678 | 2195 | 806043.73 | 367.22 |
| 4198387656238320733 | 331 | 654626.71 | 1977.72 |
| -8535248155740750540 | 117 | 635989.40 | 5435.81 |

## Platform Logs

- auth: status=ok, count=6
- edge_functions: status=ok, count=71
- realtime: status=ok, count=3
- storage: status=ok, count=0
- database_health: status=ok, count=15

## Run Comparison

- Previous run: 2026-07-07__06-14-46-119Z
- Movement status: regressed
- Delta total_ms sum: 18438370.52
- Delta calls sum: 530511

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -2876120296317350531 | 400591 | 3546994.48 |
| 852176900607336119 | 1637 | 3046704 |
| 7336725908253715888 | 1954 | 1933220.04 |
| -397576279058981298 | 284 | 847424.73 |
| -1851842182524549347 | 7689 | 829762.81 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 18438370.52

## DB Health

- postgres: commits=8761088, rollbacks=879555, blks_hit_ratio_pct=99.99, deadlocks=2

## Performance KPIs

- slow_queries_total_time_gt_1000=404, cache_hit_rate_pct=99.99, avg_rows_per_call=2.37

## Connection Snapshot

- total_connections=33, active_connections=10, idle_connections=21, waiting_connections=24, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=15
