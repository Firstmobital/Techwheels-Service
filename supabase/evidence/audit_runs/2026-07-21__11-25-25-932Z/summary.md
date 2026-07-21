# Supabase Audit Cycle Summary (2026-07-21T11:25:25.932Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query -2876120296317350531 calls=444412 total_ms=4897989.12 mean_ms=11.02

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| -2876120296317350531 | 444412 | 4897989.12 | 11.02 |
| 852176900607336119 | 2217 | 3587769.45 | 1618.30 |
| 7336725908253715888 | 2501 | 2198303.90 | 878.97 |
| -1851842182524549347 | 10618 | 1031369.59 | 97.13 |
| -397576279058981298 | 352 | 1017668.25 | 2891.10 |
| 8843009277484467611 | 253 | 1013650.73 | 4006.52 |
| -6279881906384027513 | 746 | 931475.49 | 1248.63 |
| 3787216458397661678 | 2268 | 839722.64 | 370.25 |
| -8535248155740750540 | 129 | 710207.82 | 5505.49 |
| 4198387656238320733 | 334 | 656118.46 | 1964.43 |

## Platform Logs

- auth: status=ok, count=9
- edge_functions: status=ok, count=82
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=4

## Run Comparison

- Previous run: 2026-07-21__09-05-34-309Z
- Movement status: regressed
- Delta total_ms sum: 599073.49
- Delta calls sum: 21825

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -2876120296317350531 | 16023 | 139726.61 |
| 852176900607336119 | 40 | 66993.59 |
| -6279881906384027513 | 27 | 46301.76 |
| -8535248155740750540 | 6 | 36334.33 |
| 8843009277484467611 | 8 | 33640.3 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 599073.49

## DB Health

- postgres: commits=8816200, rollbacks=879718, blks_hit_ratio_pct=99.99, deadlocks=2

## Performance KPIs

- slow_queries_total_time_gt_1000=412, cache_hit_rate_pct=99.99, avg_rows_per_call=2.35

## Connection Snapshot

- total_connections=28, active_connections=7, idle_connections=19, waiting_connections=22, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=4

## Top Postgres Errors & Warnings (Ranked by Frequency)

- No errors/warnings captured or log query unavailable.

## Top Edge Function Errors (Ranked by Frequency)

- No edge function errors captured or log query unavailable.
