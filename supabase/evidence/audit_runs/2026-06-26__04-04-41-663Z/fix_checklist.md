# Automated Fix Checklist (2026-06-26T04:04:41.663Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 25382.16
- Top single query delta_total_ms: 7515.84
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 6416750758406621842 | 20 | 7515.84 |
| 3787216458397661678 | 23 | 7058.82 |
| 852176900607336119 | 8 | 3241.47 |
| 7336725908253715888 | 33 | 2972.52 |
| -5344960703026327435 | 11 | 1340.03 |

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
