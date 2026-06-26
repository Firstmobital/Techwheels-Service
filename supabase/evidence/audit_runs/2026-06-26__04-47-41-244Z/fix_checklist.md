# Automated Fix Checklist (2026-06-26T04:47:41.244Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 56778.05
- Top single query delta_total_ms: 23390.71
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 9 | 23390.71 |
| 3787216458397661678 | 14 | 7823.84 |
| 3220864789079889211 | 14 | 6476.55 |
| -225245605736690330 | 5 | 4784.38 |
| 852176900607336119 | 5 | 3626.11 |

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
