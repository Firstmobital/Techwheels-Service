# Automated Fix Checklist (2026-06-26T03:59:42.856Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 14507.92
- Top single query delta_total_ms: 3764.96
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 2 | 3764.96 |
| -6712128630152386476 | 2 | 3464.28 |
| -5044213774447814878 | 2 | 3044.99 |
| -225245605736690330 | 2 | 2313.12 |
| -7861961781374970658 | 3 | 789.88 |

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
