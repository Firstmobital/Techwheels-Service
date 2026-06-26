# Automated Fix Checklist (2026-06-26T05:21:05.658Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 30399.46
- Top single query delta_total_ms: 10058.54
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 5 | 10058.54 |
| -225245605736690330 | 3 | 4485.05 |
| 4251000708073776526 | 7 | 4298.96 |
| 3787216458397661678 | 6 | 3317.92 |
| -7861961781374970658 | 4 | 2363.73 |

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
