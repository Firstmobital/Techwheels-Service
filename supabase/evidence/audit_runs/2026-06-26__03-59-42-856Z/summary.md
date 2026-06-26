# Supabase Audit Cycle Summary (2026-06-26T03:59:42.856Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38391 total_ms=82875942.96 mean_ms=2158.73

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38391 | 82875942.96 | 2158.73 |
| -5344960703026327435 | 6598 | 13910123.66 | 2108.23 |
| -6712128630152386476 | 5096 | 9984985.88 | 1959.38 |
| -225245605736690330 | 3187 | 4156349.55 | 1304.16 |
| -5044213774447814878 | 3048 | 3906978.46 | 1281.82 |
| -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 3220864789079889211 | 4067 | 3015545.74 | 741.47 |
| -2647655532108368607 | 4339 | 2894601.58 | 667.11 |
| -922008049376959953 | 2250 | 2637552.57 | 1172.25 |
| 852176900607336119 | 2202 | 2583385.36 | 1173.20 |

## Platform Logs

- auth: status=ok, count=2
- edge_functions: status=ok, count=48
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=2

## Run Comparison

- Previous run: 2026-06-26__03-55-13-986Z
- Movement status: regressed
- Delta total_ms sum: 14507.92
- Delta calls sum: 110

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 2 | 3764.96 |
| -6712128630152386476 | 2 | 3464.28 |
| -5044213774447814878 | 2 | 3044.99 |
| -225245605736690330 | 2 | 2313.12 |
| -7861961781374970658 | 3 | 789.88 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 14507.92

## DB Health

- postgres: commits=4256644, rollbacks=330027, blks_hit_ratio_pct=100.00, deadlocks=0
