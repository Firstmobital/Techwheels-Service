# Automated Fix Checklist (2026-06-26T03:54:36.313Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 65653.86
- Top single query delta_total_ms: 20994.23
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 6416750758406621842 | 5 | 20994.23 |
| -5344960703026327435 | 6 | 16656.81 |
| -6712128630152386476 | 3 | 13101.56 |
| 2744925251257801673 | 2 | 8208.34 |
| -4430418172455327552 | 3 | 1980.66 |

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
