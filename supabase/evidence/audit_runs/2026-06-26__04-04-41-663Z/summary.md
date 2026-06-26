# Supabase Audit Cycle Summary (2026-06-26T04:04:41.663Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38411 total_ms=82883458.80 mean_ms=2157.81

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38411 | 82883458.80 | 2157.81 |
| -5344960703026327435 | 6609 | 13911463.69 | 2104.93 |
| -6712128630152386476 | 5100 | 9985182.71 | 1957.88 |
| -225245605736690330 | 3190 | 4156704.01 | 1303.04 |
| -5044213774447814878 | 3052 | 3907143.80 | 1280.19 |
| -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 3220864789079889211 | 4072 | 3015631.26 | 740.58 |
| -2647655532108368607 | 4341 | 2895877.59 | 667.10 |
| -922008049376959953 | 2250 | 2637552.57 | 1172.25 |
| 852176900607336119 | 2210 | 2586626.83 | 1170.42 |

## Platform Logs

- auth: status=ok, count=2
- edge_functions: status=ok, count=57
- realtime: status=ok, count=1
- storage: status=ok, count=0
- database_health: status=ok, count=6

## Run Comparison

- Previous run: 2026-06-26__03-59-42-856Z
- Movement status: regressed
- Delta total_ms sum: 25382.16
- Delta calls sum: 216

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| 6416750758406621842 | 20 | 7515.84 |
| 3787216458397661678 | 23 | 7058.82 |
| 852176900607336119 | 8 | 3241.47 |
| 7336725908253715888 | 33 | 2972.52 |
| -5344960703026327435 | 11 | 1340.03 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 25382.16

## DB Health

- postgres: commits=4257310, rollbacks=330029, blks_hit_ratio_pct=100.00, deadlocks=0
