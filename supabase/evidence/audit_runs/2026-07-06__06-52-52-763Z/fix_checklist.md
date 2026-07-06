# Automated Fix Checklist (2026-07-06T06:52:52.763Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 43800535.28
- Top single query delta_total_ms: 11870098.08
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 4143 | 11870098.08 |
| 3220864789079889211 | 14050 | 9299492.89 |
| 4251000708073776526 | 20071 | 5489359.98 |
| 6462467893367818088 | 1933 | 4587091.41 |
| 7336725908253715888 | 5506 | 2787677.5 |

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
