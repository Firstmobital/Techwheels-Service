# Supabase Audit Cycle Summary (2026-07-28T05:28:38.056Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query -2876120296317350531 calls=930179 total_ms=8722262.34 mean_ms=9.38

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| -2876120296317350531 | 930179 | 8722262.34 | 9.38 |
| 852176900607336119 | 4441 | 7625381.31 | 1717.04 |
| 3787216458397661678 | 7769 | 4667616.78 | 600.80 |
| -397576279058981298 | 739 | 2361453.65 | 3195.47 |
| 7336725908253715888 | 2583 | 2279905.15 | 882.66 |
| 8843009277484467611 | 546 | 2253321.77 | 4126.96 |
| 8976932172498995662 | 9254 | 2205260.08 | 238.30 |
| -1851842182524549347 | 20711 | 1686517.67 | 81.43 |
| -6279881906384027513 | 1357 | 1490824.55 | 1098.62 |
| -6327570512180762919 | 7694 | 1403927.00 | 182.47 |

## Platform Logs

- auth: status=ok, count=100
- edge_functions: status=ok, count=100
- realtime: status=ok, count=99
- storage: status=ok, count=100
- database_health: status=ok, count=100

## Run Comparison

- Previous run: 2026-07-28__04-59-02-873Z
- Movement status: regressed
- Delta total_ms sum: 207018.15
- Delta calls sum: 5056

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 852176900607336119 | 33 | 37192.05 |
| -2876120296317350531 | 3458 | 34910.1 |
| 3827816949739656130 | 9 | 29998.61 |
| 3787216458397661678 | 88 | 25450.33 |
| -3550207178760076775 | 33 | 15174.62 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 207018.15

## DB Health

- postgres: commits=10543019, rollbacks=1023707, blks_hit_ratio_pct=99.99, deadlocks=2

## Performance KPIs

- slow_queries_total_time_gt_1000=564, cache_hit_rate_pct=99.99, avg_rows_per_call=2.57

## Connection Snapshot

- total_connections=26, active_connections=4, idle_connections=20, waiting_connections=22, max_connections=60

## Postgres Log Severity (Recent)

- error=16, warning=0, fatal=0, panic=0, total_records=100

## Top Postgres Errors & Warnings (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 122 | canceling statement due to statement timeout |
| 2 | 73 | function gen_random_bytes(integer) does not exist |
| 3 | 34 | column service_reception_entries.fuel_type does not exist |
| 4 | 33 | there is no unique or exclusion constraint matching the ON CONFLICT specification |
| 5 | 14 | new row for relation "service_reception_entries" violates check constraint "chk_service_reception_entries_jc_number_min_ |
| 6 | 10 | column service_parts_stock_snapshot_data.on_hand_qty does not exist |
| 7 | 10 | new row violates row-level security policy for table "objects" |
| 8 | 7 | permission denied for table service_reception_entries |
| 9 | 5 | canceling statement due to user request |
| 10 | 4 | column users.dealer_code does not exist |

## Top Edge Function Errors (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 35 | HEAD \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=* \| Mozilla/5.0 (Windows  |
| 2 | 12 | HEAD \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=* \| Mozilla/5.0 (Windows  |
| 3 | 10 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/run_psf_revenue_dms_import_batch \| Mozilla/5.0 (Window |
| 4 | 6 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=id%2Ccreated_at%2Csource%2 |
| 5 | 6 | ReferenceError: history is not defined
    at Object.handler (file:///var/tmp/sb-compile-edge-runtime/source/index.ts:11 |
| 6 | 4 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/technician_assignments?select=id%2Cjob_card_number%2Cwork_s |
| 7 | 4 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/get_service_advisor_summary_counts \| Mozilla/5.0 (Wind |
| 8 | 4 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=id%2Cdealer_code%2Creg_num |
| 9 | 4 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=id%2Ccreated_at%2Cservice_ |
| 10 | 4 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/auth/v1/admin/users?page=2&per_page=100 \| Deno/2.1.4 (variant; Supa |
