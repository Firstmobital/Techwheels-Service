# Automated Fix Checklist (2026-08-17T04:25:51.709Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 12375912.72
- Top single query delta_total_ms: 7115936.87
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 4868736656759022764 | 12477 | 7115936.87 |
| -2876120296317350531 | 179459 | 1307178.1 |
| 9034250094703622185 | 145 | 803689.69 |
| -6327570512180762919 | 5074 | 739540.24 |
| 8976932172498995662 | 4513 | 417347.76 |

## Auto-Generated Actions

- Realtime WAL polling increased; reduce duplicate subscriptions and channel fan-out.
- Postgres statement timeouts increased; reduce pg_cron batch sizes and add indexes for hot refresh/sync paths.
- Postgres missing-relation errors in logs; verify function/table identifiers match live schema (quoted vs lowercase names).

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
