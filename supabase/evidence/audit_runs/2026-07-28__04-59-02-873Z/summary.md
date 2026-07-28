# Supabase Audit Cycle Summary (2026-07-28T04:59:02.873Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query -2876120296317350531 calls=926721 total_ms=8687352.24 mean_ms=9.37

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| -2876120296317350531 | 926721 | 8687352.24 | 9.37 |
| 852176900607336119 | 4408 | 7588189.26 | 1721.46 |
| 3787216458397661678 | 7681 | 4642166.45 | 604.37 |
| -397576279058981298 | 737 | 2355457.05 | 3196.01 |
| 7336725908253715888 | 2583 | 2279905.15 | 882.66 |
| 8843009277484467611 | 546 | 2253321.77 | 4126.96 |
| 8976932172498995662 | 9168 | 2201031.55 | 240.08 |
| -1851842182524549347 | 20556 | 1674447.97 | 81.46 |
| -6279881906384027513 | 1350 | 1485756.97 | 1100.56 |
| -6327570512180762919 | 7646 | 1397212.46 | 182.74 |

## Platform Logs

- auth: status=ok, count=6
- edge_functions: status=ok, count=100
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=1

## Run Comparison

- Previous run: 2026-07-24__04-25-12-804Z
- Movement status: regressed
- Delta total_ms sum: 15603411.62
- Delta calls sum: 358073

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 3787216458397661678 | 2666 | 2683280.4 |
| 852176900607336119 | 1363 | 2645500.6 |
| -2876120296317350531 | 273593 | 1949583.69 |
| 8976932172498995662 | 2463 | 909256.55 |
| -397576279058981298 | 246 | 894167.16 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 15603411.62

## DB Health

- postgres: commits=10532753, rollbacks=1023674, blks_hit_ratio_pct=99.99, deadlocks=2

## Performance KPIs

- slow_queries_total_time_gt_1000=564, cache_hit_rate_pct=99.99, avg_rows_per_call=2.52

## Connection Snapshot

- total_connections=25, active_connections=4, idle_connections=19, waiting_connections=22, max_connections=60

## Postgres Log Severity (Recent)

- error=1, warning=0, fatal=0, panic=0, total_records=1

## Top Postgres Errors & Warnings (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 1 | column service_parts_stock_snapshot_data.on_hand_qty does not exist |

## Top Edge Function Errors (Ranked by Frequency)

| # | occurrences | event_message |
|---|---:|---|
| 1 | 1 | HEAD \| 500 \| https://jmdndcphkmaljhwgzqxq.supabase.co/rest/v1/service_reception_entries?select=* \| Mozilla/5.0 (Windows  |
