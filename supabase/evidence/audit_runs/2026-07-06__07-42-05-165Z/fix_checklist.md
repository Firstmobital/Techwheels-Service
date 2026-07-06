# Automated Fix Checklist (2026-07-06T07:42:05.165Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 628408.89
- Top single query delta_total_ms: 176472.2
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 51 | 176472.2 |
| 3220864789079889211 | 50 | 136102.46 |
| 6462467893367818088 | 23 | 57031.6 |
| 7336725908253715888 | 62 | 53874.1 |
| 4251000708073776526 | 97 | 50061.31 |

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
