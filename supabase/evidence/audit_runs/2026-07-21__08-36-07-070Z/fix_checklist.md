# Automated Fix Checklist (2026-07-21T08:36:07.070Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 109747.54
- Top single query delta_total_ms: 102774.99
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -2876120296317350531 | 233 | 102774.99 |
| -8535248155740750540 | 1 | 6577.47 |
| 380929009343594427 | 4 | 220.11 |
| 4706629092485339489 | 115 | 174.97 |

## Auto-Generated Actions

- OFFSET-heavy queries increased; prioritize keyset pagination on list endpoints still using range/offset.
- Realtime WAL polling increased; reduce duplicate subscriptions and channel fan-out.
- Postgres statement timeouts increased; reduce pg_cron batch sizes and add indexes for hot refresh/sync paths.

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
