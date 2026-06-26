# Supabase Audit Cycle Summary (2026-06-26T03:55:13.986Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38391 total_ms=82875942.96 mean_ms=2158.73

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38391 | 82875942.96 | 2158.73 |
| -5344960703026327435 | 6596 | 13906358.70 | 2108.30 |
| -6712128630152386476 | 5094 | 9981521.60 | 1959.47 |
| -225245605736690330 | 3185 | 4154036.43 | 1304.25 |
| -5044213774447814878 | 3046 | 3903933.47 | 1281.66 |
| -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 3220864789079889211 | 4063 | 3015491.74 | 742.18 |
| -2647655532108368607 | 4339 | 2894601.58 | 667.11 |
| -922008049376959953 | 2250 | 2637552.57 | 1172.25 |
| 852176900607336119 | 2201 | 2583241.94 | 1173.67 |

## Platform Logs

- auth: status=ok, count=2
- edge_functions: status=ok, count=97
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=8

## Run Comparison

- Previous run: 2026-06-26__03-54-36-313Z
- Movement status: regressed
- Delta total_ms sum: 1709.71
- Delta calls sum: 22

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 4706629092485339489 | 14 | 565.01 |
| 7336725908253715888 | 3 | 363.66 |
| -7861961781374970658 | 2 | 318.42 |
| -225245605736690330 | 1 | 254.74 |
| -5344960703026327435 | 1 | 187.33 |

## Regression Guard

- status: ok
- warn_triggered: false
- block_triggered: false
- delta_total_ms_sum: 1709.71

## DB Health

- postgres: commits=4256189, rollbacks=330021, blks_hit_ratio_pct=100.00, deadlocks=0
