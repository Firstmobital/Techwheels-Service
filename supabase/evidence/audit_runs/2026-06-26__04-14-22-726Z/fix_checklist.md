# Automated Fix Checklist (2026-06-26T04:14:22.726Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 81371.26
- Top single query delta_total_ms: 33137.54
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 15 | 33137.54 |
| 852176900607336119 | 10 | 12810.66 |
| 2744925251257801673 | 3 | 9967.07 |
| 3787216458397661678 | 23 | 9244.38 |
| -225245605736690330 | 6 | 6794.58 |

## Auto-Generated Actions

- Count CTE patterns increased; prioritize removing default exact-count usage on reception/list endpoints.
- OFFSET-heavy queries increased; prioritize keyset pagination on list endpoints still using range/offset.

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
