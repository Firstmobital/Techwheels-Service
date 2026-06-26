# Automated Fix Checklist (2026-06-26T04:24:40.091Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 3689.1
- Top single query delta_total_ms: 3663.13
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 1 | 3663.13 |
| 4706629092485339489 | 18 | 25.97 |

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
