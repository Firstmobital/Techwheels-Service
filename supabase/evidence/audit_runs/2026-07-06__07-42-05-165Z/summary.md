# Supabase Audit Cycle Summary (2026-07-06T07:42:05.165Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38443 total_ms=82957961.50 mean_ms=2157.95

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38443 | 82957961.50 | 2157.95 |
| -5344960703026327435 | 11147 | 26976070.39 | 2420.03 |
| 3220864789079889211 | 18686 | 12763122.79 | 683.03 |
| -6712128630152386476 | 5109 | 9998334.10 | 1957.00 |
| 4251000708073776526 | 26171 | 6713403.99 | 256.52 |
| -225245605736690330 | 4567 | 6062659.47 | 1327.49 |
| 7336725908253715888 | 11572 | 5559902.16 | 480.46 |
| 6462467893367818088 | 1956 | 4644123.01 | 2374.30 |
| -2647655532108368607 | 5462 | 3960063.95 | 725.02 |
| -5044213774447814878 | 3062 | 3913485.36 | 1278.08 |

## Platform Logs

- auth: status=ok, count=0
- edge_functions: status=ok, count=35
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=12

## Run Comparison

- Previous run: 2026-07-06__06-52-52-763Z
- Movement status: regressed
- Delta total_ms sum: 628408.89
- Delta calls sum: 2149

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 51 | 176472.2 |
| 3220864789079889211 | 50 | 136102.46 |
| 6462467893367818088 | 23 | 57031.6 |
| 7336725908253715888 | 62 | 53874.1 |
| 4251000708073776526 | 97 | 50061.31 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 628408.89

## DB Health

- postgres: commits=5745403, rollbacks=527202, blks_hit_ratio_pct=99.99, deadlocks=0

## Performance KPIs

- slow_queries_total_time_gt_1000=1120, cache_hit_rate_pct=100.00, avg_rows_per_call=8.23

## Connection Snapshot

- total_connections=25, active_connections=3, idle_connections=20, waiting_connections=22, max_connections=60

## Postgres Log Severity (Recent)

- error=0, warning=0, fatal=0, panic=0, total_records=12
