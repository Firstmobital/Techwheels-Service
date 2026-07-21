# Automated Fix Checklist (2026-07-21T08:09:21.622Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 18438370.52
- Top single query delta_total_ms: 3546994.48
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -2876120296317350531 | 400591 | 3546994.48 |
| 852176900607336119 | 1637 | 3046704 |
| 7336725908253715888 | 1954 | 1933220.04 |
| -397576279058981298 | 284 | 847424.73 |
| -1851842182524549347 | 7689 | 829762.81 |

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
