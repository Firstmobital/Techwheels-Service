# Automated Fix Checklist (2026-07-21T11:25:25.932Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 599073.49
- Top single query delta_total_ms: 139726.61
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -2876120296317350531 | 16023 | 139726.61 |
| 852176900607336119 | 40 | 66993.59 |
| -6279881906384027513 | 27 | 46301.76 |
| -8535248155740750540 | 6 | 36334.33 |
| 8843009277484467611 | 8 | 33640.3 |

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
