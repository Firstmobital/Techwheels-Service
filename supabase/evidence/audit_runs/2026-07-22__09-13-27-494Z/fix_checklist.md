# Automated Fix Checklist (2026-07-22T09:13:27.494Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 808581.62
- Top single query delta_total_ms: 403485.44
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -2647655532108368607 | 241 | 403485.44 |
| -2876120296317350531 | 11633 | 130438.76 |
| 852176900607336119 | 90 | 113779.95 |
| 8976932172498995662 | 581 | 60261.32 |
| -8535248155740750540 | 7 | 44389.72 |

## Auto-Generated Actions

- OFFSET-heavy queries increased; prioritize keyset pagination on list endpoints still using range/offset.
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
