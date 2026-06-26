# Automated Fix Checklist (2026-06-26T04:30:23.188Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 37711.57
- Top single query delta_total_ms: 16124.2
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 8 | 16124.2 |
| 7336725908253715888 | 12 | 5670.2 |
| -2647655532108368607 | 4 | 3352.85 |
| 4251000708073776526 | 10 | 2386.08 |
| -225245605736690330 | 2 | 2331.75 |

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
