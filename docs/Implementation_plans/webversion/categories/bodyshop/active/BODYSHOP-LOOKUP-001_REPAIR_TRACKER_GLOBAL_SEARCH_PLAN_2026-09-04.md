# BODYSHOP-LOOKUP-001: Repair Tracker Global Search Lookup

**Plan ID:** BODYSHOP-LOOKUP-001  
**Created:** 2026-09-04  
**Last Updated:** 2026-09-04  
**Priority:** HIGH  
**Owner:** Bodyshop Team + Platform Team  
**Status:** Active (web implemented; QA pending)  
**Platform:** webversion  
**Category:** bodyshop  
**Reference page:** `/bodyshop-repair`  
**Evidence:** `docs/Implementation_plans/webversion/categories/bodyshop/evidence/BODYSHOP-LOOKUP-001_TEST_MATRIX.md`

---

## Executive Summary

Repair Tracker search is a client filter on cards already loaded for **Period**. Default Period is This Month, so a live card from last month (example: `RJ52UA9900` / JC `005071`, billed 23 Aug, searched on 4 Sep) returns **No repair cards found**. Status defaults to Active, which can hide the same card again after a wider fetch.

This plan turns Search into a **lookup** across all `bodyshop_repair_cards` rows. Period, Branch, Advisor, Status, Stage, and Pipeline stay browse filters. When lookup is active they apply only to the hit set, after the user chooses them.

**Risk Level:** 🟡 MEDIUM  
**Estimated Duration:** 0.5–1 working day  
**Rollback Strategy:** Revert `src/lib/api/bodyshopRepair.ts`, `src/pages/BodyshopRepairPage.tsx`, and the lookup chip CSS. No schema rollback.

---

## Objectives

1. Search JC / VRN / customer across all repair cards, ignoring Period at fetch time.
2. On entering lookup, reset Status / Branch / Advisor / Stage / Pipeline to All and Period to All so the hit is visible.
3. After results land, those same controls may narrow the hit set only.
4. Clearing search restores the previous browse Period and filters.
5. Keep SA / SSA / Survey RBAC scope. Do not run unbounded Accident intake sync during lookup.

---

## Context & Background

Current path in `BodyshopRepairPage`:

1. `listRepairCards({ from, to })` filters `bodyshop_repair_cards.received_at` to the Period.
2. Accident intake sync uses the same Period.
3. Search then `includes()` on that in-memory list.

Period All in the toolbar is labeled 90 days, but empty `from`/`to` on `listRepairCards` skips the date predicate. Lookup must not reuse browse `load()` with Period All — that would re-run Accident intake without a bound.

Mobile `/bodyshop-repair` already loads up to 1000 cards with no Period. Out of scope.

**Golden case:** `RJ52UA9900` / `JC-MBTPLT-JP1-2627-005071` must appear from a This Month browse toolbar after typing the VRN.

---

## Behaviour Contract

| Mode | Trigger | Server load | Toolbar |
|---|---|---|---|
| Browse | Search shorter than 3 characters | Period-scoped cards + Accident intake (unchanged) | Period / Branch / Advisor / Status / Stage / Pipeline apply as today |
| Lookup | Debounced search ≥ 3 characters | `searchRepairCards` — no date predicate, limit 50, same RBAC scope | Enter lookup: Period + other filters → All. User may then apply filters on the hit set |
| Exit | Search cleared / shorter than 3 | Restore snapshot, browse reload | Previous Period and filters return |

VRN match uses raw `ilike` plus compact `normalizeRegNumber` (hyphens/spaces ignored). JC and customer name use `ilike` / `includes`.

---

## Implementation Tasks

### Phase 1: Lookup API
- [x] **Task 1.1:** Add `searchRepairCards` (no date; JC / VRN / customer; limit 50; existing SA/branch scope).
- [x] **Task 1.2:** Add shared match helpers (`repairLookupNeedles`, `cardMatchesRepairLookup`, `cardInReceivedDateRange`).

### Phase 2: Repair Tracker UI
- [x] **Task 2.1:** Debounce search (300ms); enter/exit lookup session; snapshot and restore browse filters.
- [x] **Task 2.2:** Lookup fetch path skips Accident intake sync; hydrate floor/photos/km for the hit set only.
- [x] **Task 2.3:** After lookup, apply Period / Branch / Advisor / Status / Stage / Pipeline on the hit set only.
- [x] **Task 2.4:** Chip + empty/header copy for lookup vs browse.

### Phase 3: Evidence
- [x] **Task 3.1:** Manual test matrix including `RJ52UA9900` / `005071`.
- [x] **Task 3.2:** Index / tracker / change log.

---

## Activity Tracker

> **Update this section in real-time as work progresses.**

### Legend
- ✅ COMPLETED
- 🔄 IN PROGRESS
- ⏳ PENDING
- ❌ BLOCKED

### Phase 1
```
✅ 1.1 | searchRepairCards API | Web Team | 2026-09-04 | 2026-09-04 | No date predicate; limit 50
✅ 1.2 | Match helpers | Web Team | 2026-09-04 | 2026-09-04 | Compact VRN + received_at range
```

### Phase 2
```
✅ 2.1 | Lookup session + debounce | Web Team | 2026-09-04 | 2026-09-04 | Snapshot browse filters
✅ 2.2 | Split browse vs lookup load | Web Team | 2026-09-04 | 2026-09-04 | Skip Accident intake on lookup
✅ 2.3 | Filters on hit set | Web Team | 2026-09-04 | 2026-09-04 | Period optional after lookup
✅ 2.4 | Chip and empty copy | Web Team | 2026-09-04 | 2026-09-04 | Searching all records
```

### Phase 3
```
✅ 3.1 | Test matrix | Web Team | 2026-09-04 | 2026-09-04 | Golden VRN
✅ 3.2 | Indexes and change log | Web Team | 2026-09-04 | 2026-09-04 | webversion INDEX + tracker
```

---

## Dependencies & Prerequisites

- [x] `bodyshop_repair_cards` exists with `job_card_no`, `reg_number`, `customer_name`, `received_at`
- [x] btree `idx_brc_job_card` exists (ILIKE still seq-scan; table is small enough for limit-50 lookup)
- [x] No new migration required for v1

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Lookup `load()` reuses Period All and scans Accident intake | Medium | High | Separate lookup path; skip intake sync |
| Status=Active still hides delivered golden card | High | High | Reset Status to All on lookup enter |
| `%` / `_` / comma in search breaks PostgREST `or()` | Low | Medium | Escape ILIKE and quote filter values |
| Clearing search briefly loads Period All | Medium | High | Hold browse reload while lookup session is exiting; restore snapshot first |

---

## Success Criteria

- ✅ Typing `RJ52UA9900` from This Month + Active browse opens the August card.
- ✅ Typing a JC fragment (`005071`) finds the same card.
- ✅ After lookup, choosing This Month hides that August card; All / Last Month can show it again.
- ✅ Clearing search returns This Month browse (or the prior Period) without an unbounded intake sync.
- ✅ SA/SSA/Survey still only see in-scope cards.

---

## Communication & Sign-Off

**Stakeholders:**
- [ ] Bodyshop owner: _______________ (Signature) (Date)
- [ ] Platform: _______________ (Signature) (Date)

---

## Notes & Lessons Learned

### 2026-09-04 - Kickoff
- User reproduced empty results for `RJ52UA9900` with Period = This Month and Status = Active.
- Decision: lookup is a different mode from the stage-queue browse, not “Period = All”.
- Mobile already loads without Period (cap 1000); no mobile change in this plan.

### 2026-09-04 - Implemented
- Web `/bodyshop-repair` lookup path is in `searchRepairCards` + lookup session on `BodyshopRepairPage`.
- Remaining: run `BODYSHOP-LOOKUP-001_TEST_MATRIX.md` on the golden VRN.

---

## Related Documentation

- `docs/Implementation_plans/webversion/categories/bodyshop/active/BODYSHOP-QUEUE-001_CANONICAL_STAGE_WORKLIST_BACKEND_PLAN_2026-06-20.md` (queue search param; not this UI)
- `docs/Implementation_plans/webversion/categories/bodyshop/active/BODYSHOP-SETTLEMENT-001_PAYMENT_RECONCILIATION_LEDGER_PLAN_2026-09-04.md` (golden JC 005071)
- `src/pages/BodyshopRepairPage.tsx`
- `src/lib/api/bodyshopRepair.ts`

---

**Last Updated:** 2026-09-04 by Cursor Agent  
**Status:** 🟡 IN PROGRESS (web implemented; QA pending)
