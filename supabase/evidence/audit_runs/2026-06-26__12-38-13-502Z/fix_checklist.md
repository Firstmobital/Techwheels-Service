# Automated Fix Checklist (2026-06-26T12:38:13.502Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 2381491.74
- Top single query delta_total_ms: 693761.4
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 230 | 693761.4 |
| 4251000708073776526 | 867 | 279371.01 |
| 3220864789079889211 | 395 | 264132.15 |
| -225245605736690330 | 110 | 215129.62 |
| 7336725908253715888 | 174 | 145403.94 |

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
