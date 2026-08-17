# Automated Fix Checklist (2026-08-14T04:44:51.337Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 6947123.9
- Top single query delta_total_ms: 4388835.59
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 4868736656759022764 | 4764 | 4388835.59 |
| -2876120296317350531 | 79699 | 605833.51 |
| -6327570512180762919 | 2761 | 411333.12 |
| 9034250094703622185 | 71 | 377803.27 |
| -2147031708195470770 | 141 | 203359.77 |

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
