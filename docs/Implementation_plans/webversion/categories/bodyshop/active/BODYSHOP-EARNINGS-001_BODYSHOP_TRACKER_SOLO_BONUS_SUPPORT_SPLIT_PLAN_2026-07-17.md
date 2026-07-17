# BODYSHOP-EARNINGS-001: Bodyshop Tracker Solo Bonus + Support Split Earnings

**Plan ID:** BODYSHOP-EARNINGS-001  
**Created:** 2026-07-17  
**Priority:** HIGH  
**Owner:** Bodyshop Team + Platform Team  
**Status:** Active (Phases 1–4 implemented in web tracker; staging QA pending)

---

## Executive Summary

Extend `/bodyshop-tracker` earnings logic so that:

1. **Dentor ↔ Dentor Helper** and **Painter ↔ Painter Helper** pairs receive a **+4% solo bonus** when the partner primary role is absent on a job card.
2. **All bodyshop floor roles** split their role earning pool equally between the **primary assignee** and **active support staff** on that role lane.
3. **Support staff** from `bodyshop_floor_support_assignments` are included in tracker earnings (today they are ignored).

Implementation is **frontend-only** for v1: shared pure helpers + `BodyshopTrackerPage.tsx` changes. No database migration is required for the fixed +4% constant. `/bodyshop-floor` assignment flows remain unchanged.

**Risk Level:** MEDIUM  
**Estimated Duration:** 2–3 working days  
**Rollback Strategy:** Revert `BodyshopTrackerPage.tsx` and `bodyshopEarnings.ts`; no schema rollback needed.

---

## Final Requirement Lock

### Income formula (unchanged base)

```
netLabour = DMS Labour ÷ 1.18
rolePoolIncome = netLabour × (effectiveRolePercent ÷ 100)
perPersonIncome = rolePoolIncome ÷ participantCount
```

- Base role percentages continue to come from `bodyshop_role_earning_settings` (UI defaults in `TABS` on tracker page).
- **SA tab** logic is out of scope and must remain unchanged.

### Solo +4% bonus pairs

| Role | +4% applies when |
|------|------------------|
| `DENTOR` | No real primary on `DENTOR_HELPER` column |
| `DENTOR_HELPER` | No real primary on `DENTOR` column |
| `PAINTER` | No real primary on `PAINTER_HELPER` column |
| `PAINTER_HELPER` | No real primary on `PAINTER` column |

**Absent partner** means any of:

- `employee_code` is `null` or empty
- `employee_code === 'NOT_REQUIRED'`
- `employee_name === 'Not Required'`
- `work_status === 'not_required'`

When bonus applies:

```
effectiveRolePercent = baseRolePercent + 4
```

When partner is present:

```
effectiveRolePercent = baseRolePercent
```

**Important:** Support staff on the same role lane **do not remove** the +4% bonus. The bonus is determined only by whether the **paired primary role column** is absent.

Example (Dentor default 5%):

| Assignment on JC | Dentor pool % | Split |
|------------------|---------------|-------|
| Primary Dentor only, no Helper | 9% (5+4) | 1 |
| Primary Dentor + 1 support, no Helper | 9% (5+4) | 2 → 4.5% each |
| Primary Dentor + 2 support, no Helper | 9% (5+4) | 3 → 3% each |
| Primary Dentor + Primary Helper | 5% | 1 on Dentor tab; 3% on Helper tab |

Same pattern applies to Painter / Painter Helper (defaults 5% / 3%).

### Support split — all roles

For **every** tracker role tab (`FLOOR_INCHARGE`, `DENTOR`, `DENTOR_HELPER`, `PAINTER`, `PAINTER_HELPER`, `TECHNICIAN`, `RUBBING`, `EDP`, `PARTS_INCHARGE`):

```
participantCount = (1 if real primary on that role) + count(active support for that support_role)
```

- Each participant on that role lane receives an **equal share** of the role pool.
- Support rows are sourced from `bodyshop_floor_support_assignments` where `is_active = true` and `support_role` matches the tab role.
- Non-bonus roles always use `effectiveRolePercent = baseRolePercent`.

Example (Technician default 4%, no bonus pair):

| Assignment | Pool % | Split |
|------------|--------|-------|
| Primary only | 4% | 1 |
| Primary + 2 support | 4% | 3 → ~1.33% each |

### Tab independence

Each role tab computes its own pool on the **full DMS labour** for the job card. Dentor income and Dentor Helper income are **not** subtracted from each other.

---

## Current System Facts (Verified 2026-07-17)

### Data sources

| Surface | Table / source | Used today by tracker |
|---------|----------------|----------------------|
| `/bodyshop-floor` primary assignments | `bodyshop_assignments` (wide row per JC) | Yes |
| `/bodyshop-floor` support staff | `bodyshop_floor_support_assignments` | **No** |
| Closed accident revenue | `job_card_closed_data` (`sr_type = 'Accident'`) | Yes |
| Role default % | `bodyshop_role_earning_settings` | Yes |

### Key files

| File | Role |
|------|------|
| [src/pages/BodyshopFloorPage.tsx](src/pages/BodyshopFloorPage.tsx) | Assigns primary + support; defines `NOT_REQUIRED` sentinel |
| [src/pages/BodyshopTrackerPage.tsx](src/pages/BodyshopTrackerPage.tsx) | **Only** earnings implementation surface |
| [src/pages/TechnicianPage.tsx](src/pages/TechnicianPage.tsx) | Reference for support expansion + split (`expandAssignmentsWithSupportTechnicians`, `buildSplitCountByJobCard`) |

### Known gaps in current tracker

1. Flat `curPct` per tab — no per-JC effective percent.
2. `NOT_REQUIRED` rows can appear as earners (`if (!code) continue` allows `NOT_REQUIRED`).
3. Support assignments are never loaded.
4. Member/day/export totals use `saIncome(sum(DMS), flatPct)` instead of summing per-person per-JC income.

---

## Scope

### In scope (v1)

- [ ] `src/lib/bodyshopEarnings.ts` — pure business logic + unit tests
- [ ] `src/pages/BodyshopTrackerPage.tsx` — data load, row expansion, income display, export
- [ ] UI labels for effective %, solo bonus badge, split label (`1/3`)
- [ ] Evidence test matrix document (manual QA checklist)

### Out of scope (v1)

- `/bodyshop-floor` UI or save-flow changes
- Database migrations
- Configurable +4% in settings (deferred)
- Mobile bodyshop tracker (no screen exists today)
- Bodyshop earnings email / edge function automation
- SA tab changes

---

## Implementation Tasks

### Phase 0: Contract freeze (no-assumption gate)

- [ ] **Task 0.1:** Product sign-off on requirement lock section above.
- [x] **Task 0.2:** Publish manual test matrix artifact.
- [ ] **Task 0.3:** Identify 3–5 real closed Accident JCs in staging/production for before/after comparison.

**Output artifact:**

- [ ] `docs/Implementation_plans/webversion/categories/bodyshop/evidence/BODYSHOP-EARNINGS-001_TEST_MATRIX.md` ✅ created 2026-07-17

### Phase 1: Shared earning helpers

- [ ] **Task 1.1:** Create `src/lib/bodyshopEarnings.ts` with:
  - `NOT_REQUIRED_CODE`, `SOLO_ROLE_BONUS_PCT = 4`
  - `SOLO_BONUS_PAIRS` constant
  - `isRealPrimaryAssignment(code, name, workStatus?)`
  - `isPartnerAbsent(bsRow, role)`
  - `getEffectiveRolePercent(role, bsRow, basePct)`
  - `getRoleParticipantCount(bsRow, supportRowsForRole)`
  - `calculateBodyshopRoleIncome(dmsLabour, effectivePct, participantCount)`
  - `buildSupportByJcRole(supportRows)` → `Map<jcUpper, Map<role, SupportRow[]>>`
- [ ] **Task 1.2:** Add `src/lib/bodyshopEarnings.test.ts` covering partner absence, +4%, split math, `NOT_REQUIRED` exclusion.
- [ ] **Task 1.3:** Run unit tests and `tsc --noEmit`.

### Phase 2: Tracker data loading

- [ ] **Task 2.1:** After `bodyshop_assignments` fetch, load `bodyshop_floor_support_assignments` for the same accident JC numbers (`is_active = true`).
- [ ] **Task 2.2:** Build `bsRowByJc` and `supportByJcRole` maps keyed by uppercase JC number (match floor convention).
- [ ] **Task 2.3:** Handle paginated / batched `in()` queries (reuse existing 100-JC batch pattern).

### Phase 3: Row enrichment + income rows

- [ ] **Task 3.1:** Skip non-real primary assignments in `enrichedTechRows` (`NOT_REQUIRED`, empty).
- [ ] **Task 3.2:** For each real primary, emit `TechJCRow` with `_role`, `_effectivePct`, `_participantCount`, `_isPrimary: true`, `technician_income`.
- [ ] **Task 3.3:** Expand support staff into additional rows per role (synthetic ids), mirroring `TechnicianPage` pattern.
- [ ] **Task 3.4:** Attach per-row income using shared helpers.

### Phase 4: Aggregates, UI, export

- [ ] **Task 4.1:** Member cards — `totalIncome = sum(technician_income)` per member, not `saIncome(totalDms, curPct)`.
- [ ] **Task 4.2:** Day cards — same per-day sum of `technician_income`.
- [ ] **Task 4.3:** Stats bar income tile — sum per-row incomes.
- [ ] **Task 4.4:** JC detail table — show effective %, split `1/N`, per-row income; solo badge when +4% applied.
- [ ] **Task 4.5:** Export — add columns: Effective %, Split, Per-person Income; remove misleading flat-% assumption.
- [ ] **Task 4.6:** Update subtitles on earnings card (`Income = (DMS ÷ 1.18) × role% · split 1/N when applicable`).

### Phase 5: Validation + sign-off

- [ ] **Task 5.1:** Execute full test matrix on staging.
- [ ] **Task 5.2:** Compare totals before/after on sample JCs (document deltas).
- [ ] **Task 5.3:** `tsc --noEmit` clean; no new linter errors in touched files.
- [ ] **Task 5.4:** Product + Bodyshop ops sign-off.

### Phase 6: Deferred enhancements

- [ ] **Task 6.1:** Add `solo_role_bonus_percent` to `bodyshop_role_earning_settings` (optional migration).
- [ ] **Task 6.2:** Mobile bodyshop tracker parity (when screen exists).
- [ ] **Task 6.3:** Shared module consumed by edge function if bodyshop earnings email is requested later.

---

## Activity Tracker

> Update this section in real-time as work progresses.

### Legend

- ✅ COMPLETED
- 🔄 IN PROGRESS
- ⏳ PENDING
- ❌ BLOCKED

### Phase 0

```text
⏳ 0.1 | Product sign-off on requirement lock | Product + Bodyshop Ops | - | - | Locked in conversation 2026-07-17
⏳ 0.2 | Publish test matrix evidence file | Engineering | 2026-07-17 | 2026-07-17 | BODYSHOP-EARNINGS-001_TEST_MATRIX.md
⏳ 0.3 | Select sample JCs for before/after | Bodyshop Ops | - | - | Pending
```

### Phase 1

```text
✅ 1.1 | Create bodyshopEarnings.ts helpers | Engineering | 2026-07-17 | 2026-07-17 | src/lib/bodyshopEarnings.ts
⏳ 1.2 | Add unit tests | Engineering | - | - | Deferred (no vitest/jest in repo)
✅ 1.3 | Typecheck gate | Engineering | 2026-07-17 | 2026-07-17 | npm run build clean
```

### Phase 2

```text
✅ 2.1 | Load support assignments in tracker | Engineering | 2026-07-17 | 2026-07-17 | BodyshopTrackerPage loadData
✅ 2.2 | Build lookup maps | Engineering | 2026-07-17 | 2026-07-17 | buildSupportByJcRole
✅ 2.3 | Batch query support rows | Engineering | 2026-07-17 | 2026-07-17 | Parallel with assignments fetch
```

### Phase 3

```text
✅ 3.1 | Filter NOT_REQUIRED primaries | Engineering | 2026-07-17 | 2026-07-17 | resolveRoleIncomeMeta
✅ 3.2 | Enrich primary rows with income metadata | Engineering | 2026-07-17 | 2026-07-17 | enrichedTechRows
✅ 3.3 | Expand support rows | Engineering | 2026-07-17 | 2026-07-17 | Support expansion in enrichedTechRows
✅ 3.4 | Wire per-row technician_income | Engineering | 2026-07-17 | 2026-07-17 | calculateBodyshopRoleIncome
```

### Phase 4

```text
✅ 4.1 | Fix member card totals | Engineering | 2026-07-17 | 2026-07-17 | Sum technician_income
✅ 4.2 | Fix day card totals | Engineering | 2026-07-17 | 2026-07-17 | Sum technician_income
✅ 4.3 | Fix stats bar income | Engineering | 2026-07-17 | 2026-07-17 | totals.totalIncome
✅ 4.4 | JC detail columns + solo badge | Engineering | 2026-07-17 | 2026-07-17 | Effective %, split, +4% solo badge
✅ 4.5 | Export column updates | Engineering | 2026-07-17 | 2026-07-17 | Base %, Effective %, Split, Assignment
✅ 4.6 | Subtitle copy updates | Engineering | 2026-07-17 | 2026-07-17 | techIncomeSubtitle
```

### Phase 5

```text
⏳ 5.1 | Manual test matrix on staging | Bodyshop Ops + Eng | - | - | Pending
⏳ 5.2 | Before/after sample JC comparison | Bodyshop Ops | - | - | Pending
⏳ 5.3 | Typecheck + lint gate | Engineering | - | - | Pending
⏳ 5.4 | Sign-off | Product + Ops | - | - | Pending
```

---

## Test Matrix (Manual QA Contract)

### Dentor / Dentor Helper (base Dentor 5%, Helper 3%)

| # | Primary Dentor | Dentor support | Primary Helper | Dentor tab pool | Dentor split | Helper tab pool |
|---|----------------|----------------|----------------|-----------------|--------------|-----------------|
| D1 | Real | 0 | Absent | 9% | 1 | — |
| D2 | Real | 1 | Absent | 9% | 2 | — |
| D3 | Real | 2 | Absent | 9% | 3 | — |
| D4 | Real | 0 | Real | 5% | 1 | 3% |
| D5 | Absent | 0 | Real | — | — | 7% (3+4) |
| D6 | NOT_REQUIRED | 0 | Real | — | — | 3% |
| D7 | Real | 1 | Real | 5% | 2 | 3% |

### Painter / Painter Helper

Same matrix as Dentor with Painter 5% / Painter Helper 3% defaults.

### Other roles (e.g. Technician 4%)

| # | Primary | Support count | Pool % | Split |
|---|---------|---------------|--------|-------|
| T1 | Real | 0 | 4% | 1 |
| T2 | Real | 2 | 4% | 3 |
| T3 | NOT_REQUIRED | 0 | — | — |

### Regression

| # | Check | Expected |
|---|-------|----------|
| R1 | SA tab | Unchanged |
| R2 | `NOT_REQUIRED` row | Never appears as earner |
| R3 | Zero DMS labour | ₹0 income |
| R4 | Member total | Equals sum of JC detail incomes |
| R5 | Export | Reflects effective % and split |

---

## File Change List

| File | Action |
|------|--------|
| `src/lib/bodyshopEarnings.ts` | **Add** |
| `src/lib/bodyshopEarnings.test.ts` | **Add** |
| `src/pages/BodyshopTrackerPage.tsx` | **Modify** |
| `src/pages/BodyshopFloorPage.tsx` | No change |
| `supabase/migrations/*` | No change (v1) |
| `docs/.../evidence/BODYSHOP-EARNINGS-001_TEST_MATRIX.md` | **Add** (Phase 0) |

---

## Dependencies & Prerequisites

- [x] Business rules confirmed with product (2026-07-17 conversation).
- [ ] Access to staging `/bodyshop-tracker` and sample closed Accident JCs.
- [ ] No RBAC changes required (`bodyshop_tracker` module already gates page).
- [ ] `bodyshop_floor_support_assignments` read policy already allows authenticated reads.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Totals diverge from user expectations after split | Medium | High | Before/after sample JC sheet; test matrix sign-off |
| Performance with large support lists | Low | Medium | Batch support fetch; same JC batching as assignments |
| `NOT_REQUIRED` edge cases | Medium | Medium | Shared `isRealPrimaryAssignment`; unit tests |
| Future +4% config drift | Low | Low | Central constant; Phase 6 settings key |

---

## Success Criteria

- ✅ Support staff appear on correct role tabs with equal split of role pool.
- ✅ +4% applies for bonus pairs only when partner primary is absent, including when support exists on same lane.
- ✅ All roles split primary + support equally.
- ✅ `NOT_REQUIRED` never earns.
- ✅ Member/day/export totals equal sum of per-row `technician_income`.
- ✅ SA tab unchanged.
- ✅ `tsc --noEmit` clean.

---

## Communication & Sign-Off

**Stakeholders:**

- [ ] Product Owner: _______________ (Date)
- [ ] Bodyshop Operations Lead: _______________ (Date)
- [ ] Web Engineering Lead: _______________ (Date)

---

## Notes & Lessons Learned

### 2026-07-17 — Kickoff / requirement lock

- Audited `BodyshopTrackerPage.tsx` and `BodyshopFloorPage.tsx`; confirmed tracker ignores support assignments today.
- Solo bonus revised during discussion: support on same lane **does not** block +4%; pool is `(default + 4%)` then split among primary + support when partner primary is absent.
- +4% is fixed in code for v1; settings key deferred.
- Reference implementation pattern: `TechnicianPage.tsx` support expansion and split count.
