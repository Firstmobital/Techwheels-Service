# Automated Fix Checklist (2026-07-22T07:32:07.447Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 2162425.96
- Top single query delta_total_ms: 425284.36
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 852176900607336119 | 226 | 425284.36 |
| -2876120296317350531 | 48242 | 419047.46 |
| 7020006022636007382 | 991 | 333742.24 |
| 8976932172498995662 | 540 | 195473.55 |
| -6279881906384027513 | 75 | 116267.71 |

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
