# Supabase Audit Cycle Summary (2026-06-26T04:14:22.726Z)

- Project ref: jmdndcphkmaljhwgzqxq
- Capture mode: automated_supabase_audit_cycle
- Top query summary: Top query 6416750758406621842 calls=38411 total_ms=82883458.80 mean_ms=2157.81

## Query Performance (Top 10)

| queryid | calls | total_ms | mean_ms |
|---|---:|---:|---:|
| 6416750758406621842 | 38411 | 82883458.80 | 2157.81 |
| -5344960703026327435 | 6628 | 13952781.04 | 2105.13 |
| -6712128630152386476 | 5106 | 9985405.38 | 1955.62 |
| -225245605736690330 | 3198 | 4165646.31 | 1302.58 |
| -5044213774447814878 | 3056 | 3907298.51 | 1278.57 |
| -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 3220864789079889211 | 4082 | 3015868.38 | 738.82 |
| -2647655532108368607 | 4341 | 2895877.59 | 667.10 |
| -922008049376959953 | 2253 | 2637823.97 | 1170.81 |
| 852176900607336119 | 2224 | 2601672.65 | 1169.82 |

## Platform Logs

- auth: status=ok, count=2
- edge_functions: status=ok, count=100
- realtime: status=ok, count=0
- storage: status=ok, count=0
- database_health: status=ok, count=4

## Run Comparison

- Previous run: 2026-06-26__04-07-48-947Z
- Movement status: regressed
- Delta total_ms sum: 81371.26
- Delta calls sum: 299

| queryid | delta_calls | delta_total_ms |
|---|---:|---:|
| -5344960703026327435 | 15 | 33137.54 |
| 852176900607336119 | 10 | 12810.66 |
| 2744925251257801673 | 3 | 9967.07 |
| 3787216458397661678 | 23 | 9244.38 |
| -225245605736690330 | 6 | 6794.58 |

## Regression Guard

- status: blocked_requires_checklist
- warn_triggered: true
- block_triggered: true
- delta_total_ms_sum: 81371.26

## DB Health

- postgres: commits=4258628, rollbacks=330045, blks_hit_ratio_pct=100.00, deadlocks=0
