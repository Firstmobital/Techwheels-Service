# Automated Fix Checklist (2026-07-07T06:14:46.119Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 3425053.57
- Top single query delta_total_ms: 475741.16
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 6462467893367818088 | 212 | 475741.16 |
| 852176900607336119 | 503 | 396781.32 |
| 3220864789079889211 | 145 | 286193.14 |
| -2876120296317350531 | 24357 | 221571.48 |
| -3550207178760076775 | 292 | 208420.52 |

## Auto-Generated Actions

- Realtime WAL polling increased; reduce duplicate subscriptions and channel fan-out.

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
