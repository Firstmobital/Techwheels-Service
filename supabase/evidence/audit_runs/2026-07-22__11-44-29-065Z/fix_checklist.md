# Automated Fix Checklist (2026-07-22T11:44:29.065Z)

## Guard Status

- Status: blocked_requires_checklist
- Delta total_ms sum: 1328716.34
- Top single query delta_total_ms: 405610.55
- Warn threshold: 2000
- Block threshold: 5000
- Block single-query threshold: 1500

## Top Regressions

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 3833171277786028740 | 3351 | 405610.55 |
| -2876120296317350531 | 16674 | 302878.68 |
| -2647655532108368607 | 82 | 206536.5 |
| 4706629092485339489 | 4822 | 121897.12 |
| 852176900607336119 | 70 | 114163.12 |

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
