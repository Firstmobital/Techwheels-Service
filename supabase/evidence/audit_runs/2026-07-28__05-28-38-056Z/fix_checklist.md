# Automated Fix Checklist (2026-07-28T05:28:38.056Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 207018.15
- Top single query delta_total_ms: 37192.05
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 852176900607336119 | 33 | 37192.05 |
| -2876120296317350531 | 3458 | 34910.1 |
| 3827816949739656130 | 9 | 29998.61 |
| 3787216458397661678 | 88 | 25450.33 |
| -3550207178760076775 | 33 | 15174.62 |

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
