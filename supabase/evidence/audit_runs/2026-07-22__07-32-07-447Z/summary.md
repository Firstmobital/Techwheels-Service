# Supabase Audit Cycle Summary (2026-07-22T07:32:07.447Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query -2876120296317350531 calls=492654 total_ms=5317036.58 mean_ms=10.79

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| -2876120296317350531 | 492654 | 5317036.58 | 10.79 |
| 852176900607336119 | 2443 | 4013053.81 | 1642.67 |
| 7336725908253715888 | 2577 | 2274688.03 | 882.69 |
| 8843009277484467611 | 275 | 1103223.99 | 4011.72 |
| -1851842182524549347 | 11715 | 1097862.58 | 93.71 |
| -397576279058981298 | 382 | 1095271.78 | 2867.20 |
| -6279881906384027513 | 821 | 1047743.20 | 1276.18 |
| 3787216458397661678 | 2514 | 934997.93 | 371.92 |
| 8976932172498995662 | 4940 | 809999.51 | 163.97 |
| -8535248155740750540 | 141 | 783030.62 | 5553.41 |

## Platform Logs

- auth: status=ok, count=11
- edge_functions: status=ok, count=100
- realtime: status=ok, count=0
- storage: status=ok, count=9
- database_health: status=ok, count=7

## Run Comparison

- Previous run: 2026-07-21__11-25-25-932Z
- Movement status: regressed
- Delta total_ms sum: 2162425.96
- Delta calls sum: 64397

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 852176900607336119 | 226 | 425284.36 |
| -2876120296317350531 | 48242 | 419047.46 |
| 7020006022636007382 | 991 | 333742.24 |
| 8976932172498995662 | 540 | 195473.55 |
| -6279881906384027513 | 75 | 116267.71 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 2162425.96

## DB Health

- postgres: commits=8956552, rollbacks=900276, blks_hit_ratio_pct=99.99, deadlocks=2

## Performance KPIs

- slow_queries_total_time_gt_1000=437, cache_hit_rate_pct=99.99, avg_rows_per_call=2.99

## Connection Snapshot

- total_connections=32, active_connections=3, idle_connections=27, waiting_connections=30, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=7

## Top Postgres Errors & Warnings (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 1 | invalid input syntax for type uuid: "1709" |

## Top Edge Function Errors (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 1 | [universal-drive-upload] pending log write failed: invalid input syntax for type uuid: "1709"
 |
