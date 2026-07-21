# Automated Fix Checklist (2026-07-21T08:32:26.944Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 378782.23
- Top single query delta_total_ms: 287642.83
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -2876120296317350531 | 958 | 287642.83 |
| -8535248155740750540 | 3 | 18469.25 |
| 852176900607336119 | 8 | 16849.75 |
| -6279881906384027513 | 5 | 7700.98 |
| 4706629092485339489 | 728 | 6899.41 |

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
