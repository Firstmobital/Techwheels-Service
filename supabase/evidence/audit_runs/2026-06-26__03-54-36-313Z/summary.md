# Supabase Audit Cycle Summary (2026-06-26T03:54:36.313Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38391 total_ms=82875942.96 mean_ms=2158.73

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38391 | 82875942.96 | 2158.73 |
| -5344960703026327435 | 6595 | 13906171.37 | 2108.59 |
| -6712128630152386476 | 5094 | 9981521.60 | 1959.47 |
| -225245605736690330 | 3184 | 4153781.69 | 1304.58 |
| -5044213774447814878 | 3046 | 3903933.47 | 1281.66 |
| -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 3220864789079889211 | 4062 | 3015471.19 | 742.36 |
| -2647655532108368607 | 4339 | 2894601.58 | 667.11 |
| -922008049376959953 | 2250 | 2637552.57 | 1172.25 |
| 852176900607336119 | 2201 | 2583241.94 | 1173.67 |

## Platform Logs

- auth: status=ok, count=1
- edge_functions: status=ok, count=36
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=2

## Run Comparison

- Previous run: 2026-06-26__03-51-50-883Z
- Movement status: regressed
- Delta total_ms sum: 65653.86
- Delta calls sum: 93

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 6416750758406621842 | 5 | 20994.23 |
| -5344960703026327435 | 6 | 16656.81 |
| -6712128630152386476 | 3 | 13101.56 |
| 2744925251257801673 | 2 | 8208.34 |
| -4430418172455327552 | 3 | 1980.66 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 65653.86

## DB Health

- postgres: commits=4256113, rollbacks=330020, blks_hit_ratio_pct=100.00, deadlocks=0
