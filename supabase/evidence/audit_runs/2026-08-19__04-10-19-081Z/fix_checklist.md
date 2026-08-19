# Automated Fix Checklist (2026-08-19T04:10:19.081Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 9888364.82
- Top single query delta_total_ms: 2509093.1
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 4868736656759022764 | 12506 | 2509093.1 |
| -5005470507640866181 | 357 | 2100591.64 |
| 7020006022636007382 | 4915 | 1998141.1 |
| -2876120296317350531 | 173223 | 1238065.34 |
| -7693544260640056809 | 439 | 1203098.21 |

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
