# Automated Fix Checklist (2026-08-07T06:57:54.789Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 30153611.19
- Top single query delta_total_ms: 5295202.39
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -2876120296317350531 | 724603 | 5295202.39 |
| 852176900607336119 | 3350 | 4467168.14 |
| -1491976781120316096 | 2435 | 2219340.4 |
| 8843009277484467611 | 386 | 2108170.66 |
| -9017937788314432713 | 1787 | 1715892.88 |

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
