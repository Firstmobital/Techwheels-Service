# Automated Fix Checklist (2026-06-26T04:33:21.433Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 16722.77
- Top single query delta_total_ms: 6379.24
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 2 | 6379.24 |
| -225245605736690330 | 2 | 4492.58 |
| 3220864789079889211 | 3 | 1698.41 |
| 4251000708073776526 | 8 | 1223 |
| -7861961781374970658 | 1 | 1065.54 |

## Auto-Generated Actions

- Continue monitoring and prioritize top delta_total_ms queryids in next patch batch.

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
