# Supabase Audit Cycle Summary (2026-08-19T04:10:19.081Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 4868736656759022764 calls=39234 total_ms=23422698.54 mean_ms=597.00

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 4868736656759022764 | 39234 | 23422698.54 | 597.00 |
| -2876120296317350531 | 2587915 | 20721402.40 | 8.01 |
| 852176900607336119 | 7798 | 12095778.11 | 1551.14 |
| 8843009277484467611 | 1074 | 5145534.15 | 4791.00 |
| 9034250094703622185 | 1068 | 5033839.69 | 4713.33 |
| -397576279058981298 | 1400 | 4989895.36 | 3564.21 |
| 3787216458397661678 | 8951 | 4894882.24 | 546.85 |
| -2147031708195470770 | 3965 | 4850747.39 | 1223.39 |
| 8976932172498995662 | 29263 | 4570641.05 | 156.19 |
| -6327570512180762919 | 31481 | 4317307.11 | 137.14 |

## Platform Logs

- auth: status=ok, count=100
- edge_functions: status=ok, count=100
- realtime: status=ok, count=52
- storage: status=ok, count=100
- database_health: status=ok, count=100

## Run Comparison

- Previous run: 2026-08-17__04-25-51-709Z
- Movement status: regressed
- Delta total_ms sum: 9888364.82
- Delta calls sum: 199982

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 4868736656759022764 | 12506 | 2509093.1 |
| -5005470507640866181 | 357 | 2100591.64 |
| 7020006022636007382 | 4915 | 1998141.1 |
| -2876120296317350531 | 173223 | 1238065.34 |
| -7693544260640056809 | 439 | 1203098.21 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 9888364.82

## DB Health

- postgres: commits=15450129, rollbacks=1432720, blks_hit_ratio_pct=99.99, deadlocks=2

## Performance KPIs

- slow_queries_total_time_gt_1000=744, cache_hit_rate_pct=99.99, avg_rows_per_call=2.06

## Connection Snapshot

- total_connections=29, active_connections=5, idle_connections=22, waiting_connections=26, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=100

## Top Postgres Errors & Warnings (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 36 | canceling statement due to statement timeout |
| 2 | 5 | Cannot delete: bodyshop repair card has a DMS job card assigned (JC-MBTPLT-JP1-2627-006109). Complete or cancel the body |
| 3 | 4 | Cannot delete: bodyshop repair card has a DMS job card assigned (JC-MBTPLT-JP1-2627-006111). Complete or cancel the body |
| 4 | 3 | invalid input syntax for type uuid: "3676" |
| 5 | 3 | column users.dealer_code does not exist |
| 6 | 2 | invalid input syntax for type uuid: "3682" |
| 7 | 2 | duplicate key value violates unique constraint "idx_rto_idspay_reg_no" |
| 8 | 2 | invalid input syntax for type uuid: "6570" |
| 9 | 2 | permission denied for table technician_assignments |
| 10 | 2 | permission denied for table employee_master |

## Top Edge Function Errors (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 12 | ReferenceError: history is not defined
    at Object.handler (file:///var/tmp/sb-compile-edge-runtime/source/index.ts:11 |
| 2 | 10 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=id%2Creg_number%2Cmodel%2C |
| 3 | 6 | HEAD \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/post_service_feedback_messages?select=id&sent_at=not.is.nu |
| 4 | 4 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/search_reception_reg_numbers \| Mozilla/5.0 (Windows NT |
| 5 | 4 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/list_reception_entries_page \| Mozilla/5.0 (Windows NT  |
| 6 | 3 | [universal-drive-upload] pending log write failed: invalid input syntax for type uuid: "3676"
 |
| 7 | 3 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/auth/v1/admin/users?page=2&per_page=100 \| Deno/2.1.4 (variant; Supa |
| 8 | 2 | Audit log failed: {
  code: "22P02",
  details: null,
  hint: null,
  message: 'invalid input syntax for type uuid: "sys |
| 9 | 2 | [universal-drive-upload] pending log write failed: invalid input syntax for type uuid: "3686"
 |
| 10 | 2 | [universal-drive-upload] pending log write failed: invalid input syntax for type uuid: "6570"
 |
