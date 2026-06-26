# Automated Fix Checklist (2026-06-26T06:03:50.248Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 237967
- Top single query delta_total_ms: 65022.03
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 23 | 65022.03 |
| 3787216458397661678 | 54 | 29160.41 |
| 2744925251257801673 | 4 | 24362.71 |
| 3220864789079889211 | 42 | 21192.35 |
| -225245605736690330 | 14 | 20909.29 |

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
