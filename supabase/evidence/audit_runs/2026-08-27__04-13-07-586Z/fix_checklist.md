# Automated Fix Checklist (2026-08-27T04:13:07.586Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 34035929.95
- Top single query delta_total_ms: 6622257.4
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 4868736656759022764 | 40488 | 6622257.4 |
| -6635419992937290236 | 5894 | 6556094.53 |
| -2876120296317350531 | 720400 | 5092248.41 |
| -17274511114325214 | 469 | 2722690.34 |
| 9122241668290838279 | 6711 | 2678199.52 |

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
