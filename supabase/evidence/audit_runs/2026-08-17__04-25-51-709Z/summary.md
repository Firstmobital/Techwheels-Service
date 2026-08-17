# Supabase Audit Cycle Summary (2026-08-17T04:25:51.709Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 4868736656759022764 calls=26728 total_ms=20913605.44 mean_ms=782.46

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 4868736656759022764 | 26728 | 20913605.44 | 782.46 |
| -2876120296317350531 | 2414692 | 19483337.06 | 8.07 |
| 852176900607336119 | 7797 | 12094748.46 | 1551.21 |
| 8843009277484467611 | 1074 | 5145534.15 | 4791.00 |
| -397576279058981298 | 1400 | 4989895.36 | 3564.21 |
| 3787216458397661678 | 8951 | 4894882.24 | 546.85 |
| -2147031708195470770 | 3444 | 4235633.36 | 1229.86 |
| 9034250094703622185 | 891 | 4046500.55 | 4541.53 |
| -6327570512180762919 | 27565 | 3879420.84 | 140.74 |
| 8976932172498995662 | 24524 | 3839983.66 | 156.58 |

## Platform Logs

- auth: status=ok, count=100
- edge_functions: status=ok, count=100
- realtime: status=ok, count=100
- storage: status=ok, count=39
- database_health: status=ok, count=100

## Run Comparison

- Previous run: 2026-08-14__04-44-51-337Z
- Movement status: regressed
- Delta total_ms sum: 12375912.72
- Delta calls sum: 203000

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 4868736656759022764 | 12477 | 7115936.87 |
| -2876120296317350531 | 179459 | 1307178.1 |
| 9034250094703622185 | 145 | 803689.69 |
| -6327570512180762919 | 5074 | 739540.24 |
| 8976932172498995662 | 4513 | 417347.76 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 12375912.72

## DB Health

- postgres: commits=14876994, rollbacks=1379555, blks_hit_ratio_pct=99.99, deadlocks=2

## Performance KPIs

- slow_queries_total_time_gt_1000=721, cache_hit_rate_pct=99.99, avg_rows_per_call=2.08

## Connection Snapshot

- total_connections=43, active_connections=4, idle_connections=37, waiting_connections=40, max_connections=60

## Postgres Log Severity (Recent)

- error=2, warning=0, fatal=0, panic=0, total_records=100

## Top Postgres Errors & Warnings (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 287 | canceling statement due to statement timeout |
| 2 | 51 | permission denied: caller is not the SA on this reception entry |
| 3 | 34 | there is no unique or exclusion constraint matching the ON CONFLICT specification |
| 4 | 28 | invalid input syntax for type timestamp with time zone: "T00:00:00+05:30" |
| 5 | 24 | duplicate key value violates unique constraint "uq_service_reception_entries_jc_number_norm" |
| 6 | 22 | function gen_random_bytes(integer) does not exist |
| 7 | 7 | permission denied for table technician_assignments |
| 8 | 2 | column users.dealer_code does not exist |
| 9 | 1 | invalid input syntax for type uuid: "2507" |
| 10 | 1 | invalid input syntax for type uuid: "2510" |

## Top Edge Function Errors (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 240 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/list_reception_entries_page \| Mozilla/5.0 (Windows NT  |
| 2 | 12 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/list_reception_entries_page \| Mozilla/5.0 (Linux; Andr |
| 3 | 9 | ReferenceError: history is not defined
    at Object.handler (file:///var/tmp/sb-compile-edge-runtime/source/index.ts:11 |
| 4 | 8 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/list_reception_reg_created_since \| Mozilla/5.0 (Window |
| 5 | 6 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/list_reception_entries_page \| Mozilla/5.0 (Windows NT  |
| 6 | 2 | HEAD \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/post_service_feedback_messages?select=id&sent_at=not.is.nu |
| 7 | 2 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/auth/v1/admin/users?page=2&per_page=100 \| Deno/2.1.4 (variant; Supa |
| 8 | 1 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/vw_technician_income_assignments?select=*&order=assigned_at |
| 9 | 1 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/list_reception_entries_by_jc_numbers \| Mozilla/5.0 (Wi |
| 10 | 1 | [universal-drive-upload] pending log write failed: invalid input syntax for type uuid: "2509"
 |
