# BODYSHOP-EARNINGS-001 — Manual Test Matrix

**Plan:** `BODYSHOP-EARNINGS-001_BODYSHOP_TRACKER_SOLO_BONUS_SUPPORT_SPLIT_PLAN_2026-07-17.md`  
**Created:** 2026-07-17  
**Purpose:** Manual QA checklist for staging/production validation before sign-off.

---

## Preconditions

- [ ] Plan Phase 1–4 implemented in `BodyshopTrackerPage.tsx` + `bodyshopEarnings.ts`
- [ ] At least one closed Accident JC in the selected date range with DMS labour > 0
- [ ] Base role % known from tracker settings (defaults: Dentor 5%, Dentor Helper 3%, Painter 5%, Painter Helper 3%, Technician 4%)

---

## Formula reference

```
netLabour = DMS Labour ÷ 1.18
rolePoolIncome = netLabour × (effectiveRolePercent ÷ 100)
perPersonIncome = rolePoolIncome ÷ participantCount
```

**+4% solo bonus:** `effectiveRolePercent = base + 4` when paired primary role is absent.  
**Split:** `participantCount = primary (0|1) + active support count on that role lane`.

---

## Dentor / Dentor Helper

| ID | Setup on `/bodyshop-floor` | Dentor tab: pool % | Dentor split | Helper tab: pool % | Pass |
|----|----------------------------|--------------------|--------------|--------------------|------|
| D1 | Primary Dentor only; no Helper | 9% | 1 | — | [ ] |
| D2 | Primary Dentor + 1 Dentor support; no Helper | 9% | 2 (4.5% each) | — | [ ] |
| D3 | Primary Dentor + 2 Dentor support; no Helper | 9% | 3 (3% each) | — | [ ] |
| D4 | Primary Dentor + Primary Helper; no support | 5% | 1 | 3% | [ ] |
| D5 | Primary Helper only; no Dentor | — | — | 7% (3+4) | [ ] |
| D6 | Helper = Not Required; Dentor only | 9% | 1 | — | [ ] |
| D7 | Dentor + 1 support + Primary Helper | 5% | 2 | 3% | [ ] |

---

## Painter / Painter Helper

| ID | Setup | Painter tab: pool % | Painter split | Helper tab: pool % | Pass |
|----|-------|---------------------|---------------|--------------------|------|
| P1 | Primary Painter only; no Helper | 9% | 1 | — | [ ] |
| P2 | Primary Painter + 1 Painter support; no Helper | 9% | 2 | — | [ ] |
| P3 | Primary Painter + 2 Painter support; no Helper | 9% | 3 | — | [ ] |
| P4 | Primary Painter + Primary Helper | 5% | 1 | 3% | [ ] |
| P5 | Primary Helper only; no Painter | — | — | 7% | [ ] |

---

## Other roles (no +4% bonus)

| ID | Role | Setup | Pool % | Split | Pass |
|----|------|-------|--------|-------|------|
| T1 | Technician | Primary only | 4% | 1 | [ ] |
| T2 | Technician | Primary + 2 support | 4% | 3 | [ ] |
| T3 | Rubbing | Primary + 1 support | 2% | 2 | [ ] |
| T4 | Any role | Not Required primary | No earner row | — | [ ] |

---

## Aggregates & export

| ID | Check | Expected | Pass |
|----|-------|----------|------|
| A1 | Member card total | Sum of JC detail `technician_income` for that member | [ ] |
| A2 | Day card total | Sum of JC detail incomes for that day | [ ] |
| A3 | Stats bar income tile | Sum of visible filtered rows | [ ] |
| A4 | Export Excel | Effective %, split, per-person income columns correct | [ ] |
| A5 | SA tab | Unchanged from pre-implementation behavior | [ ] |

---

## Sample JC log (fill during QA)

| JC Number | Scenario ID | DMS Labour | Role | Expected pool % | Expected split | Actual per-person | Pass |
|-----------|-------------|------------|------|-------------------|----------------|-------------------|------|
| | | | | | | | [ ] |
| | | | | | | | [ ] |
| | | | | | | | [ ] |

---

## Sign-off

- [ ] Engineering: _______________ Date: _______
- [ ] Bodyshop Ops: _______________ Date: _______
