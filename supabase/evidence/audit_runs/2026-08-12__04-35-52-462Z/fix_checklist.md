# Automated Fix Checklist (2026-08-12T04:35:52.462Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 15938307.98
- Top single query delta_total_ms: 5949732.15
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 4868736656759022764 | 6773 | 5949732.15 |
| -2876120296317350531 | 427942 | 2991034.62 |
| 9034250094703622185 | 597 | 2452766.49 |
| -8270989164380621721 | 582 | 2023170.23 |
| -2147031708195470770 | 594 | 794049.57 |

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
