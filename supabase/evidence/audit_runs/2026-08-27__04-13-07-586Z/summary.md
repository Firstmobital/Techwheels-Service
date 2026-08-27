# Supabase Audit Cycle Summary (2026-08-27T04:13:07.586Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 4868736656759022764 calls=79722 total_ms=30044955.94 mean_ms=376.87

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 4868736656759022764 | 79722 | 30044955.94 | 376.87 |
| -2876120296317350531 | 3308315 | 25813650.81 | 7.80 |
| 852176900607336119 | 7799 | 12098137.97 | 1551.24 |
| 9034250094703622185 | 1419 | 7201726.68 | 5075.21 |
| 8976932172498995662 | 44979 | 6912196.98 | 153.68 |
| -6635419992937290236 | 5894 | 6556094.53 | 1112.33 |
| -2147031708195470770 | 5242 | 6440501.81 | 1228.63 |
| -7693544260640056809 | 3006 | 5978722.73 | 1988.93 |
| -6327570512180762919 | 44167 | 5708607.91 | 129.25 |
| 8843009277484467611 | 1074 | 5145534.15 | 4791.00 |

## Platform Logs

- auth: status=ok, count=100
- edge_functions: status=ok, count=100
- realtime: status=ok, count=34
- storage: status=ok, count=100
- database_health: status=ok, count=100

## Run Comparison

- Previous run: 2026-08-19__04-10-19-081Z
- Movement status: regressed
- Delta total_ms sum: 34035929.95
- Delta calls sum: 798848

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 4868736656759022764 | 40488 | 6622257.4 |
| -6635419992937290236 | 5894 | 6556094.53 |
| -2876120296317350531 | 720400 | 5092248.41 |
| -17274511114325214 | 469 | 2722690.34 |
| 9122241668290838279 | 6711 | 2678199.52 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 34035929.95

## DB Health

- postgres: commits=17570594, rollbacks=1611198, blks_hit_ratio_pct=99.99, deadlocks=2

## Performance KPIs

- slow_queries_total_time_gt_1000=796, cache_hit_rate_pct=99.99, avg_rows_per_call=2.07

## Connection Snapshot

- total_connections=30, active_connections=4, idle_connections=24, waiting_connections=27, max_connections=60

## Postgres Log Severity (Recent)

- error=3, warning=0, fatal=0, panic=0, total_records=100

## Top Postgres Errors & Warnings (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 71 | canceling statement due to statement timeout |
| 2 | 22 | there is no unique or exclusion constraint matching the ON CONFLICT specification |
| 3 | 4 | duplicate key value violates unique constraint "uq_service_reception_entries_jc_number_norm" |
| 4 | 3 | permission denied for table technician_assignments |
| 5 | 1 | invalid input syntax for type uuid: "6383" |
| 6 | 1 | invalid input syntax for type uuid: "4027" |
| 7 | 1 | invalid input syntax for type uuid: "4026" |
| 8 | 1 | invalid input syntax for type uuid: "4030" |
| 9 | 1 | invalid input syntax for type uuid: "4029" |
| 10 | 1 | invalid input syntax for type uuid: "4025" |

## Top Edge Function Errors (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 15 | ReferenceError: history is not defined
    at Object.handler (file:///var/tmp/sb-compile-edge-runtime/source/index.ts:11 |
| 2 | 11 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=id%2Creg_number%2Cmodel%2C |
| 3 | 8 | POST \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/rpc/list_reception_entries_page \| Mozilla/5.0 (Windows NT  |
| 4 | 7 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=id%2Creg_number%2Cmodel%2C |
| 5 | 6 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/technician_assignments?select=id%2Cjob_card_number%2Cwork_s |
| 6 | 5 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=id%2Creg_number%2Cmodel%2C |
| 7 | 5 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=id%2Creg_number%2Cmodel%2C |
| 8 | 3 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/technician_assignments?select=id%2Cjob_card_number%2Cwork_s |
| 9 | 2 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=id%2Creg_number%2Cmodel%2C |
| 10 | 2 | GET \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=id%2Creg_number%2Cmodel%2C |
