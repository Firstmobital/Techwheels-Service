# Automated Fix Checklist (2026-06-26T04:51:30.388Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 29937.12
- Top single query delta_total_ms: 10381.63
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 3 | 10381.63 |
| 852176900607336119 | 5 | 6729.88 |
| 3787216458397661678 | 12 | 6690.97 |
| 3220864789079889211 | 4 | 2009.28 |
| -3076875962393720596 | 2 | 1992.46 |

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
