# Automated Fix Checklist (2026-07-24T04:25:12.804Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 5541869.49
- Top single query delta_total_ms: 987414.53
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -2876120296317350531 | 132167 | 987414.53 |
| 3787216458397661678 | 1942 | 940369.21 |
| 852176900607336119 | 442 | 701691.78 |
| -922008049376959953 | 486 | 439780.76 |
| 8976932172498995662 | 978 | 376729.59 |

## Auto-Generated Actions

- Realtime WAL polling increased; reduce duplicate subscriptions and channel fan-out.

## Validation SQL

```sql
SELECT
  queryid,
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms
FROM extensions.pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 25;
```
