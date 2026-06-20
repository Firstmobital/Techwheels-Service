# BODYSHOP-QUEUE-001 Parity Checklist

Date: 2026-06-20
Plan: BODYSHOP-QUEUE-001
Scope: Shadow validation for canonical stage worklist backend projection

---

## 1) Goal

Validate that backend-projected stage worklist results match legacy frontend behavior before cutover.

Pass criteria:
1. No unexplained stage-count mismatches.
2. No unexplained per-card stage-membership mismatches.
3. All mismatches, if any, mapped to approved rule updates or legacy bug fixes.

---

## 2) Baseline Inputs

- [ ] Rule version selected and frozen for test window.
- [ ] Legacy frontend snapshot source identified.
- [ ] Backend projection snapshot source identified.
- [ ] Branch/dealer scope fixed for each comparison run.
- [ ] Time window fixed for each comparison run.

Run metadata:
- Rule version:
- Scope (dealer/branch):
- Snapshot timestamp:
- Compared by:

---

## 3) Stage Count Parity

Check all stages 1-18.

| Stage | Legacy Count | Projection Count | Match (Y/N) | Notes |
|---|---:|---:|---|---|
| 1 |  |  |  |  |
| 2 |  |  |  |  |
| 3 |  |  |  |  |
| 4 |  |  |  |  |
| 5 |  |  |  |  |
| 6 |  |  |  |  |
| 7 |  |  |  |  |
| 8 |  |  |  |  |
| 9 |  |  |  |  |
| 10 |  |  |  |  |
| 11 |  |  |  |  |
| 12 |  |  |  |  |
| 13 |  |  |  |  |
| 14 |  |  |  |  |
| 15 |  |  |  |  |
| 16 |  |  |  |  |
| 17 |  |  |  |  |
| 18 |  |  |  |  |

---

## 4) Per-Card Membership Parity

Use sampled and full-card checks.

| Repair Card ID | JC/Reg | Legacy Stages | Projection Stages | Match (Y/N) | Reason Codes Reviewed |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |

---

## 5) Critical Gating Cases

Must be validated explicitly:

- [ ] Stage 9 done criteria (survey date + status + hold remark rule).
- [ ] Stage 10 readiness (survey approved + survey approval evidence + approved parts finalized).
- [ ] Stage 11 pending criteria and floor completion dependencies.
- [ ] Stage 12 pending criteria when additional approval is requested.
- [ ] Concurrency behavior for stages 10/11/12.
- [ ] Cash/FOC no-doc intake behavior remains unchanged.

---

## 6) Mismatch Log

| ID | Type (Count/Card) | Description | Suspected Cause | Owner | Status |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
|  |  |  |  |  |  |

---

## 7) Decision Gate

Release recommendation:
- [ ] GO (projection parity accepted)
- [ ] NO-GO (blocking mismatches remain)

Approvals:
- [ ] Product Owner
- [ ] Bodyshop Ops Lead
- [ ] Platform Lead
- [ ] Web Lead
- [ ] Mobile Lead

---

## 8) Evidence Links

- Parity report output:
- Comparison query/script:
- Screenshot/video evidence:
- Related issue tracker:
