# Supabase Audit Cycle Summary (2026-06-26T04:07:48.947Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38411 total_ms=82883458.80 mean_ms=2157.81

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38411 | 82883458.80 | 2157.81 |
| -5344960703026327435 | 6613 | 13919643.50 | 2104.89 |
| -6712128630152386476 | 5102 | 9985288.05 | 1957.13 |
| -225245605736690330 | 3192 | 4158851.73 | 1302.90 |
| -5044213774447814878 | 3054 | 3907221.76 | 1279.38 |
| -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 3220864789079889211 | 4075 | 3015644.96 | 740.04 |
| -2647655532108368607 | 4341 | 2895877.59 | 667.10 |
| -922008049376959953 | 2250 | 2637552.57 | 1172.25 |
| 852176900607336119 | 2214 | 2588861.99 | 1169.31 |

## Platform Logs

- auth: status=ok, count=2
- edge_functions: status=ok, count=100
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=3

## Run Comparison

- Previous run: 2026-06-26__04-04-41-663Z
- Movement status: regressed
- Delta total_ms sum: 19079.54
- Delta calls sum: 112

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 4 | 8179.81 |
| 3787216458397661678 | 12 | 4867.68 |
| 852176900607336119 | 4 | 2235.16 |
| -225245605736690330 | 2 | 2147.72 |
| -7861961781374970658 | 3 | 782.61 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 19079.54

## DB Health

- postgres: commits=4257679, rollbacks=330032, blks_hit_ratio_pct=100.00, deadlocks=0
