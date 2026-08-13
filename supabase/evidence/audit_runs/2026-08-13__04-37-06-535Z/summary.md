# Supabase Audit Cycle Summary (2026-08-13T04:37:06.535Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query -2876120296317350531 calls=2155534 total_ms=17570325.45 mean_ms=8.15

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| -2876120296317350531 | 2155534 | 17570325.45 | 8.15 |
| 852176900607336119 | 7797 | 12094748.46 | 1551.21 |
| 4868736656759022764 | 9487 | 9408832.98 | 991.76 |
| 8843009277484467611 | 1074 | 5145534.15 | 4791.00 |
| -397576279058981298 | 1391 | 4942631.44 | 3553.29 |
| 3787216458397661678 | 8951 | 4894882.24 | 546.85 |
| -2147031708195470770 | 3109 | 3743416.52 | 1204.06 |
| 8976932172498995662 | 19068 | 3325893.54 | 174.42 |
| 3109077696112254485 | 1036 | 3111709.14 | 3003.58 |
| 9034250094703622185 | 675 | 2865007.59 | 4244.46 |

## Platform Logs

- auth: status=ok, count=100
- edge_functions: status=ok, count=100
- realtime: status=ok, count=42
- storage: status=ok, count=100
- database_health: status=ok, count=100

## Run Comparison

- Previous run: 2026-08-12__04-35-52-462Z
- Movement status: regressed
- Delta total_ms sum: 6509888.18
- Delta calls sum: 80346

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 4868736656759022764 | 2714 | 3459100.83 |
| -2876120296317350531 | 72810 | 561826.1 |
| 9034250094703622185 | 78 | 412241.1 |
| -2147031708195470770 | 219 | 324476.31 |
| -6327570512180762919 | 2616 | 297269.94 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 6509888.18

## DB Health

- postgres: commits=14050060, rollbacks=1315525, blks_hit_ratio_pct=99.99, deadlocks=2

## Performance KPIs

- slow_queries_total_time_gt_1000=705, cache_hit_rate_pct=99.99, avg_rows_per_call=2.17

## Connection Snapshot

- total_connections=32, active_connections=4, idle_connections=26, waiting_connections=29, max_connections=60

## Postgres Log Severity (Recent)

- error=25, warning=0, fatal=0, panic=0, total_records=100

## Top Postgres Errors & Warnings (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 609 | canceling statement due to statement timeout |
| 2 | 57 | function gen_random_bytes(integer) does not exist |
| 3 | 21 | there is no unique or exclusion constraint matching the ON CONFLICT specification |
| 4 | 8 | column all_service_data.registration_no does not exist |
| 5 | 8 | column all_service_data.cust_first_name does not exist |
| 6 | 5 | permission denied for table users |
| 7 | 5 | invalid input syntax for type uuid: "3299" |
| 8 | 3 | invalid input syntax for type uuid: "3287" |
| 9 | 3 | invalid input syntax for type uuid: "3302" |
| 10 | 3 | invalid input syntax for type uuid: "3325" |

## Top Edge Function Errors (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 201 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/list_reception_entries_page \| Mozilla/5.0 (Windows NT  |
| 2 | 68 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/list_reception_entries_page \| Mozilla/5.0 (Windows NT  |
| 3 | 30 | HEAD \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=* \| Mozilla/5.0 (Windows  |
| 4 | 17 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=reg_number%2Cmodel%2Cowner |
| 5 | 9 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/list_reception_entries_page \| Mozilla/5.0 (Linux; Andr |
| 6 | 8 | HEAD \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=* \| Mozilla/5.0 (Windows  |
| 7 | 8 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=reg_number%2Cmodel%2Cowner |
| 8 | 6 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=reg_number%2Cmodel%2Cowner |
| 9 | 5 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=reg_number%2Cmodel%2Cowner |
| 10 | 5 | [universal-drive-upload] pending log write failed: invalid input syntax for type uuid: "3299"
 |
