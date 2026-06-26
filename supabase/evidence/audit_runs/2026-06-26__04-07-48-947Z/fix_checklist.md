# Automated Fix Checklist (2026-06-26T04:07:48.947Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 19079.54
- Top single query delta_total_ms: 8179.81
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 4 | 8179.81 |
| 3787216458397661678 | 12 | 4867.68 |
| 852176900607336119 | 4 | 2235.16 |
| -225245605736690330 | 2 | 2147.72 |
| -7861961781374970658 | 3 | 782.61 |

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
