# Supabase Audit Cycle Summary (2026-08-07T06:57:54.789Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query -2876120296317350531 calls=1654782 total_ms=14017464.73 mean_ms=8.47

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| -2876120296317350531 | 1654782 | 14017464.73 | 8.47 |
| 852176900607336119 | 7791 | 12092549.45 | 1552.12 |
| 3787216458397661678 | 8951 | 4894882.24 | 546.85 |
| 8843009277484467611 | 932 | 4361492.43 | 4679.71 |
| -397576279058981298 | 1190 | 4058020.02 | 3410.10 |
| 8976932172498995662 | 14968 | 2894287.41 | 193.37 |
| -2147031708195470770 | 2296 | 2624890.64 | 1143.25 |
| -3550207178760076775 | 6947 | 2522195.65 | 363.06 |
| 3109077696112254485 | 893 | 2502647.39 | 2802.52 |
| -1851842182524549347 | 32201 | 2488035.67 | 77.27 |

## Platform Logs

- auth: status=ok, count=100
- edge_functions: status=ok, count=100
- realtime: status=ok, count=73
- storage: status=ok, count=100
- database_health: status=ok, count=100

## Run Comparison

- Previous run: 2026-07-28__05-28-38-056Z
- Movement status: regressed
- Delta total_ms sum: 30153611.19
- Delta calls sum: 534072

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -2876120296317350531 | 724603 | 5295202.39 |
| 852176900607336119 | 3350 | 4467168.14 |
| -1491976781120316096 | 2435 | 2219340.4 |
| 8843009277484467611 | 386 | 2108170.66 |
| -9017937788314432713 | 1787 | 1715892.88 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 30153611.19

## DB Health

- postgres: commits=12678747, rollbacks=1198791, blks_hit_ratio_pct=99.99, deadlocks=2

## Performance KPIs

- slow_queries_total_time_gt_1000=638, cache_hit_rate_pct=99.99, avg_rows_per_call=2.14

## Connection Snapshot

- total_connections=30, active_connections=5, idle_connections=23, waiting_connections=27, max_connections=60

## Postgres Log Severity (Recent)

- error=4, warning=0, fatal=0, panic=0, total_records=100

## Top Postgres Errors & Warnings (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 170 | canceling statement due to statement timeout |
| 2 | 105 | function gen_random_bytes(integer) does not exist |
| 3 | 37 | there is no unique or exclusion constraint matching the ON CONFLICT specification |
| 4 | 9 | duplicate key value violates unique constraint "uq_service_reception_entries_jc_number_norm" |
| 5 | 9 | permission denied for table service_reception_entries |
| 6 | 5 | permission denied for table technician_assignments |
| 7 | 4 | invalid input syntax for type uuid: "3023" |
| 8 | 4 | invalid input syntax for type uuid: "3054" |
| 9 | 4 | invalid input syntax for type uuid: "system:internal-dispatch" |
| 10 | 4 | column users.dealer_code does not exist |

## Top Edge Function Errors (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 23 | HEAD \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=* \| Mozilla/5.0 (Windows  |
| 2 | 22 | PATCH \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?id=eq.6155&select=* \| Mozilla/5 |
| 3 | 10 | ReferenceError: history is not defined
    at Object.handler (file:///var/tmp/sb-compile-edge-runtime/source/index.ts:11 |
| 4 | 8 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=* \| Mozilla/5.0 (Windows  |
| 5 | 7 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=id%2Cdealer_code%2Creg_num |
| 6 | 6 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=id%2Cdealer_code%2Creg_num |
| 7 | 5 | HEAD \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=* \| Mozilla/5.0 (Windows  |
| 8 | 5 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=* \| Mozilla/5.0 (Windows  |
| 9 | 5 | PATCH \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?id=eq.6177&select=* \| Mozilla/5 |
| 10 | 5 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=* \| Mozilla/5.0 (Windows  |
