# Supabase Audit Cycle Summary (2026-06-26T03:51:50.883Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38386 total_ms=82854948.73 mean_ms=2158.47

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38386 | 82854948.73 | 2158.47 |
| -5344960703026327435 | 6589 | 13889514.56 | 2107.99 |
| -6712128630152386476 | 5091 | 9968420.04 | 1958.05 |
| -225245605736690330 | 3182 | 4153545.97 | 1305.33 |
| -5044213774447814878 | 3046 | 3903933.47 | 1281.66 |
| -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 3220864789079889211 | 4059 | 3015416.80 | 742.90 |
| -2647655532108368607 | 4339 | 2894601.58 | 667.11 |
| -922008049376959953 | 2248 | 2637205.96 | 1173.13 |
| 852176900607336119 | 2200 | 2582543.40 | 1173.88 |

## Platform Logs

- auth: status=ok, count=1
- edge_functions: status=ok, count=86
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=2

## Run Comparison

- Previous run: 2026-06-26__03-50-23-506Z
- Movement status: regressed
- Delta total_ms sum: 2913.13
- Delta calls sum: 36

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 3787216458397661678 | 2 | 1455.58 |
| 852176900607336119 | 1 | 688.19 |
| 7336725908253715888 | 3 | 252.49 |
| -7861961781374970658 | 2 | 232.28 |
| -225245605736690330 | 1 | 122.07 |

## DB Health

- postgres: commits=4255729, rollbacks=330010, blks_hit_ratio_pct=100.00, deadlocks=0
