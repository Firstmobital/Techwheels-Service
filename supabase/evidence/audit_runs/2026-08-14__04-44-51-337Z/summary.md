# Supabase Audit Cycle Summary (2026-08-14T04:44:51.337Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query -2876120296317350531 calls=2235233 total_ms=18176158.96 mean_ms=8.13

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| -2876120296317350531 | 2235233 | 18176158.96 | 8.13 |
| 4868736656759022764 | 14251 | 13797668.57 | 968.19 |
| 852176900607336119 | 7797 | 12094748.46 | 1551.21 |
| 8843009277484467611 | 1074 | 5145534.15 | 4791.00 |
| -397576279058981298 | 1399 | 4986579.51 | 3564.39 |
| 3787216458397661678 | 8951 | 4894882.24 | 546.85 |
| -2147031708195470770 | 3250 | 3946776.29 | 1214.39 |
| 8976932172498995662 | 20011 | 3422635.90 | 171.04 |
| 9034250094703622185 | 746 | 3242810.86 | 4346.93 |
| 3109077696112254485 | 1043 | 3148514.52 | 3018.71 |

## Platform Logs

- auth: status=ok, count=100
- edge_functions: status=ok, count=100
- realtime: status=ok, count=87
- storage: status=ok, count=100
- database_health: status=ok, count=100

## Run Comparison

- Previous run: 2026-08-13__04-37-06-535Z
- Movement status: regressed
- Delta total_ms sum: 6947123.9
- Delta calls sum: 88948

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 4868736656759022764 | 4764 | 4388835.59 |
| -2876120296317350531 | 79699 | 605833.51 |
| -6327570512180762919 | 2761 | 411333.12 |
| 9034250094703622185 | 71 | 377803.27 |
| -2147031708195470770 | 141 | 203359.77 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 6947123.9

## DB Health

- postgres: commits=14308149, rollbacks=1336544, blks_hit_ratio_pct=99.99, deadlocks=2

## Performance KPIs

- slow_queries_total_time_gt_1000=714, cache_hit_rate_pct=99.99, avg_rows_per_call=2.14

## Connection Snapshot

- total_connections=28, active_connections=3, idle_connections=23, waiting_connections=26, max_connections=60

## Postgres Log Severity (Recent)

- error=4, warning=0, fatal=0, panic=0, total_records=100

## Top Postgres Errors & Warnings (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 343 | canceling statement due to statement timeout |
| 2 | 56 | invalid input syntax for type timestamp with time zone: "T00:00:00+05:30" |
| 3 | 52 | function gen_random_bytes(integer) does not exist |
| 4 | 9 | there is no unique or exclusion constraint matching the ON CONFLICT specification |
| 5 | 5 | duplicate key value violates unique constraint "uq_service_reception_entries_jc_number_norm" |
| 6 | 3 | canceling statement due to user request |
| 7 | 3 | permission denied for table technician_assignments |
| 8 | 3 | column user_employee_links.deleted_at does not exist |
| 9 | 2 | column service_reception_entries.fuel_type does not exist |
| 10 | 2 | invalid input syntax for type uuid: "3402" |

## Top Edge Function Errors (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 197 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/list_reception_entries_page \| Mozilla/5.0 (Windows NT  |
| 2 | 42 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/list_reception_entries_page \| Mozilla/5.0 (Windows NT  |
| 3 | 17 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/list_reception_entries_page \| Mozilla/5.0 (Linux; Andr |
| 4 | 10 | ReferenceError: history is not defined
    at Object.handler (file:///var/tmp/sb-compile-edge-runtime/source/index.ts:11 |
| 5 | 8 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=reg_number%2Cmodel%2Cowner |
| 6 | 6 | HEAD \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=* \| Mozilla/5.0 (Windows  |
| 7 | 4 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=reg_number%2Cmodel%2Cowner |
| 8 | 3 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/search_reception_reg_numbers \| Mozilla/5.0 (Windows NT |
| 9 | 3 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/get_reception_entries_by_ids \| Mozilla/5.0 (Windows NT |
| 10 | 2 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/auth/v1/admin/users?page=2&per_page=100 \| Deno/2.1.4 (variant; Supa |
