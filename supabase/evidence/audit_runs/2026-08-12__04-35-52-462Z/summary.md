# Supabase Audit Cycle Summary (2026-08-12T04:35:52.462Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query -2876120296317350531 calls=2082724 total_ms=17008499.35 mean_ms=8.17

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| -2876120296317350531 | 2082724 | 17008499.35 | 8.17 |
| 852176900607336119 | 7797 | 12094748.46 | 1551.21 |
| 4868736656759022764 | 6773 | 5949732.15 | 878.45 |
| 8843009277484467611 | 1074 | 5145534.15 | 4791.00 |
| 3787216458397661678 | 8951 | 4894882.24 | 546.85 |
| -397576279058981298 | 1356 | 4756405.52 | 3507.67 |
| -2147031708195470770 | 2890 | 3418940.21 | 1183.02 |
| 8976932172498995662 | 17876 | 3133257.95 | 175.28 |
| 3109077696112254485 | 1008 | 2969380.37 | 2945.81 |
| 1012486468402746359 | 387 | 2646509.52 | 6838.53 |

## Platform Logs

- auth: status=ok, count=100
- edge_functions: status=ok, count=100
- realtime: status=ok, count=56
- storage: status=ok, count=100
- database_health: status=ok, count=100

## Run Comparison

- Previous run: 2026-08-07__06-57-54-789Z
- Movement status: regressed
- Delta total_ms sum: 15938307.98
- Delta calls sum: 439380

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 4868736656759022764 | 6773 | 5949732.15 |
| -2876120296317350531 | 427942 | 2991034.62 |
| 9034250094703622185 | 597 | 2452766.49 |
| -8270989164380621721 | 582 | 2023170.23 |
| -2147031708195470770 | 594 | 794049.57 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 15938307.98

## DB Health

- postgres: commits=13802310, rollbacks=1292788, blks_hit_ratio_pct=99.99, deadlocks=2

## Performance KPIs

- slow_queries_total_time_gt_1000=699, cache_hit_rate_pct=99.99, avg_rows_per_call=2.16

## Connection Snapshot

- total_connections=33, active_connections=7, idle_connections=24, waiting_connections=26, max_connections=60

## Postgres Log Severity (Recent)

- error=28, warning=0, fatal=0, panic=0, total_records=100

## Top Postgres Errors & Warnings (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 652 | canceling statement due to statement timeout |
| 2 | 71 | column all_service_data.registration_no does not exist |
| 3 | 66 | function gen_random_bytes(integer) does not exist |
| 4 | 44 | column all_service_data.cust_first_name does not exist |
| 5 | 27 | there is no unique or exclusion constraint matching the ON CONFLICT specification |
| 6 | 15 | column users.dealer_code does not exist |
| 7 | 11 | syntax error at or near "'EMPTY'" |
| 8 | 8 | Employee link required |
| 9 | 3 | invalid input syntax for type uuid: "3267" |
| 10 | 3 | invalid input syntax for type uuid: "3263" |

## Top Edge Function Errors (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 130 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/list_reception_entries_page \| Mozilla/5.0 (Windows NT  |
| 2 | 52 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/list_reception_entries_page \| Mozilla/5.0 (Windows NT  |
| 3 | 34 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=reg_number%2Cmodel%2Cowner |
| 4 | 14 | HEAD \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=* \| Mozilla/5.0 (Windows  |
| 5 | 13 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/auth/v1/admin/users?page=2&per_page=100 \| Deno/2.1.4 (variant; Supa |
| 6 | 12 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=reg_number%2Cmodel%2Cowner |
| 7 | 12 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=reg_number%2Cmodel%2Cowner |
| 8 | 9 | HEAD \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=* \| Mozilla/5.0 (Windows  |
| 9 | 7 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=reg_number%2Cmodel%2Cowner |
| 10 | 7 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=reg_number%2Cmodel%2Cowner |
