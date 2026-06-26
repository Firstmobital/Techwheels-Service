# Automated Fix Checklist (2026-06-26T04:24:15.532Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 120728.76
- Top single query delta_total_ms: 65216.18
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 17 | 65216.18 |
| 852176900607336119 | 10 | 17616.3 |
| 3787216458397661678 | 21 | 10894.95 |
| 6416750758406621842 | 3 | 7384.96 |
| 2744925251257801673 | 1 | 6226.5 |

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
