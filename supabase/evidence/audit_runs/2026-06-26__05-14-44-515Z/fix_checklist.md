# Automated Fix Checklist (2026-06-26T05:14:44.515Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 159997.82
- Top single query delta_total_ms: 68267.76
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 23 | 68267.76 |
| 3787216458397661678 | 36 | 17038.27 |
| -225245605736690330 | 7 | 11505.89 |
| 3220864789079889211 | 23 | 11074.39 |
| 4251000708073776526 | 53 | 9882.66 |

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
