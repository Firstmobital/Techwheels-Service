# Automated Fix Checklist (2026-07-21T09:05:34.309Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 920265.31
- Top single query delta_total_ms: 599278.73
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -2876120296317350531 | 2250 | 599278.73 |
| 7336725908253715888 | 66 | 102357.46 |
| 852176900607336119 | 22 | 54318.58 |
| 8976932172498995662 | 62 | 37402.85 |
| -5344960703026327435 | 13 | 21636.53 |

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
