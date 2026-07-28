# Automated Fix Checklist (2026-07-28T04:59:02.873Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 15603411.62
- Top single query delta_total_ms: 2683280.4
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 3787216458397661678 | 2666 | 2683280.4 |
| 852176900607336119 | 1363 | 2645500.6 |
| -2876120296317350531 | 273593 | 1949583.69 |
| 8976932172498995662 | 2463 | 909256.55 |
| -397576279058981298 | 246 | 894167.16 |

## Auto-Generated Actions

- Realtime WAL polling increased; reduce duplicate subscriptions and channel fan-out.
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
