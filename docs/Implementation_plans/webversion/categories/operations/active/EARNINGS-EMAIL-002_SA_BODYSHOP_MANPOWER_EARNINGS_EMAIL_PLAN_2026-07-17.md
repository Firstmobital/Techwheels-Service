# EARNINGS-EMAIL-002: SA Tracker + Bodyshop Tracker Manpower Earnings Email Report

**Plan ID:** EARNINGS-EMAIL-002  
**Created:** 2026-07-17  
**Priority:** HIGH  
**Owner:** Operations Team + Bodyshop Team + Platform Team  
**Status:** Active (audit complete; implementation not started)  
**Reference implementation:** [TECH-EARNINGS-001](TECH-EARNINGS-001_TECHNICIAN_DAILY_EARNINGS_EMAIL_AUTOMATION_PLAN_2026-06-09.md)

---

## Executive Summary

Add **✉️ Email Report** to `/sa-tracker` and `/bodyshop-tracker` with the same UX contract as `/technician`:

1. Button appears in the top toolbar for **admin / super_admin** only (`canEditSharePercent` gate).
2. Button is **enabled only when 📅 Range has both start and end dates** and there is at least one earnings row in the current filtered view.
3. Click sends an email with an **Excel bank-payout workbook** (same 13-column NEFT/DCR contract as technician) so finance can dispatch earnings to employees.
4. **WYSIWYG test mode:** UI passes pre-computed earnings rows from the on-screen filters (Range + Loc + Portal + Dept/tab context) — same pattern as `TechnicianPage` → `sendTechnicianDailyEarningsTestEmail()`.

Rollout is two-stage per tracker (manual test button first; scheduled automation deferred to a follow-up plan).

**Risk Level:** MEDIUM  
**Estimated Duration:** 3–5 working days (both trackers)  
**Rollback Strategy:** Hide email buttons; leave edge functions deployed but unused.

---

## Audit Summary (2026-07-17)

### Technician `/technician` — reference (implemented)

| Area | Status |
|------|--------|
| UI button `✉️ Email Report` | ✅ Top toolbar; admin-only |
| Range gate | ✅ Requires `fromDate` + `toDate` + `technicianCards.length > 0` |
| API | ✅ `sendTechnicianDailyEarningsTestEmail()` in [src/lib/api/email.ts](../../../src/lib/api/email.ts) |
| Edge function | ✅ `technician-daily-earnings-report` — test mode accepts client `rows[]` |
| Excel | ✅ 13 columns A–M, no header row; bank fields from `employee_master` |
| Email | ✅ `send-transactional-email`; upload to `autodoc` bucket |

### SA Tracker `/sa-tracker` — gaps

| Area | Status | Notes |
|------|--------|-------|
| `✉️ Email Report` button | ❌ Missing | Has Yesterday, Pivot, **💰 Payout Report** modal only |
| Range filter | ✅ `fromDate` / `toDate` in stats bar | Same gate pattern as technician |
| Earnings cards | ✅ `saCards[]` with `totalIncome` | PV/EV % via `calculateEligibleSAIncome` + `completedJobCards` |
| Admin gate | ✅ `canEditSharePercent` exists | Used only for PV/EV % settings today |
| Bank Excel (local) | ⚠️ Different format | Payout modal uses 11-column **header** sheet — not bank import format |
| Employee code on cards | ⚠️ Missing on `saCards` | Must resolve via `resolveSaEmployee(name, employee_code)` from filtered rows |
| Email API / edge function | ❌ None | — |

### Bodyshop Tracker `/bodyshop-tracker` — gaps

| Area | Status | Notes |
|------|--------|-------|
| `✉️ Email Report` button | ❌ Missing | Has **📥 Export Issues** only (range-gated) |
| Range filter | ✅ `fromDate` / `toDate` | Applied on top of Period preset |
| Earnings cards | ✅ `memberCards[]` per **active tab** | Uses [src/lib/bodyshopEarnings.ts](../../../../src/lib/bodyshopEarnings.ts) after BODYSHOP-EARNINGS-001 |
| All-manpower scope | ❌ Not aggregated | User wants **all roles** (10 tabs), not active tab only |
| Admin gate | ❌ Missing | No `canEditSharePercent` / role check on page |
| Employee code on cards | ⚠️ Missing on `memberCards` | Available on `TechJCRow.technician_code` / accident SA rows |
| Email API / edge function | ❌ None | — |

### Shared infrastructure (reusable)

- `send-transactional-email` edge function
- `employee_master`: `employee_code`, `bank_name`, `account_number`, `ifsc`
- Technician bank Excel builder in `technician-daily-earnings-report/index.ts` (lines ~719–746)
- Auth: session JWT on test sends; `validateRequest` in edge functions

### Known data-quality risks (document, do not block v1)

1. **`job_card_closed_data` duplicates:** Trackers do not dedupe to latest `closed_date_time`. SA tab can double-count; bodyshop accident map may last-write-win. Email will mirror UI totals (WYSIWYG) until dedupe is fixed in a separate plan.
2. **Missing bank details:** Technician allows empty F/G columns. Same behaviour for SA/bodyshop v1; optional hard-block is a product decision.

---

## Final Requirement Lock

### UX parity with Technician

| Rule | Value |
|------|-------|
| Button label | `✉️ Email Report` |
| Button colour | `#0ea5e9` (same as technician) |
| Visibility | `canEditSharePercent` (admin / super_admin) |
| Enable condition | `fromDate && toDate && earningsRows.length > 0` |
| Disabled tooltip | Same copy pattern as technician Range gate |
| Success/error toast | Inline state below toolbar (match technician) |
| Scope label in email | Range + Loc + Portal (+ Dept for SA; + "All roles" for bodyshop) |

### Excel contract (bank dispatch)

Reuse **exact** technician 13-column workbook contract (no header row):

| Col | Field | Source |
|-----|-------|--------|
| A | `300971` | Static |
| B | `FIRST MOBITAL PRIVATE LIMITED` | Static |
| C | `39171760445` | Static |
| D | `DCR` or `NEFT` | SBI bank → DCR, else NEFT |
| E | Employee name | Row name |
| F | Account number | `employee_master.account_number` |
| G | IFSC | `employee_master.ifsc` |
| H | Earnings amount | 2 decimal places |
| I | `SALARY{n}` | Sequential counter |
| J–M | Static | Same as technician |

**Workbook structure:**

| Tracker | Sheets |
|---------|--------|
| SA Tracker | `SA Earnings` (bank rows, one per SA) |
| Bodyshop Tracker | `Bank Payout` (one row per **employee_code**, earnings **summed across all roles** if same person appears on multiple tabs) + `Detail by Role` (audit: Role, Code, Name, Earnings, JC count) |

Product sign-off required before coding if finance needs a different sheet layout for bodyshop.

### Earnings calculation (must match on-screen UI)

| Tracker | Rule |
|---------|------|
| SA | Sum of `calculateEligibleSAIncome(row, pvOrEvPct, completedJobCards)` per SA name in Range-filtered `deptFilteredRows` (respect branch, portal, dept filters) |
| Bodyshop | For each of 10 role lanes: same logic as `memberCards` but across **all tabs** on Range-filtered rows; tech roles use `technician_income` from enriched rows; SA tab uses `saIncome(dmsLabour, saPct)` |

### Recipients (test phase)

Mirror technician env pattern:

- `SA_EARNINGS_TEST_RECIPIENTS` (comma-separated)
- `BODYSHOP_EARNINGS_TEST_RECIPIENTS` (comma-separated)
- Fallback: same default list as `TECH_EARNINGS_TEST_RECIPIENTS` until ops configures separately

---

## Architecture Recommendation

### Option chosen: dedicated edge functions + shared Excel helper

Do **not** overload `technician-daily-earnings-report` with SA/bodyshop modes — keeps RBAC, filenames, and templates isolated.

```
UI (WYSIWYG rows)
  → src/lib/api/email.ts (new send* functions)
  → supabase/functions/sa-earnings-report
  → supabase/functions/bodyshop-earnings-report
  → _shared/bankPayoutExcel.ts (extracted from technician)
  → send-transactional-email
```

**Why client-provided rows for test mode (Stage A):**

1. Guarantees email matches what admin sees after Range/Loc/Portal filters.
2. Avoids re-implementing bodyshop solo bonus + support split server-side in v1.
3. Same proven pattern as technician Range email (already in production).

**Stage B (future):** Server-side recompute + pg_cron — out of scope for EARNINGS-EMAIL-002; note in TECH-EARNINGS-001 style follow-up.

---

## Implementation Tasks

### Phase 0: Shared extraction + contract sign-off

- [ ] Extract `buildBankPayoutWorksheetRows()` + `isSbiBank()` to `supabase/functions/_shared/bankPayoutExcel.ts`.
- [ ] Refactor `technician-daily-earnings-report` to use shared helper (no behaviour change).
- [ ] Product/finance confirm bodyshop two-sheet layout (Bank Payout + Detail by Role).
- [ ] Document env vars in Supabase secrets runbook.

### Phase 1: SA Tracker email (Stage A)

**Backend**

- [ ] Create `supabase/functions/sa-earnings-report/index.ts`.
- [ ] Inputs: `runMode: 'test'`, `runFromIst`, `runToIst`, `reportScopeLabel`, optional `rows[]`:
  ```ts
  { employeeCode: string; employeeName: string; earnings: number }[]
  ```
- [ ] Join `employee_master` by `employeeCode`; build bank Excel; send email.
- [ ] Template: `SA Earnings Report - {date}` (inline HTML like technician).

**Frontend** — [src/pages/SATrackerPage.tsx](../../../../src/pages/SATrackerPage.tsx)

- [ ] Add `sendSAEarningsTestEmail()` to [src/lib/api/email.ts](../../../../src/lib/api/email.ts).
- [ ] Build `saEmailRows` from `saCards` + `resolveSaEmployee` for `employee_code`.
- [ ] Add `✉️ Email Report` button next to **💰 Payout Report** (admin-only, Range-gated).
- [ ] Add `sendingReportEmail` + `reportEmailState` UI feedback.

**Note:** Existing **💰 Payout Report** modal remains unchanged (different use case: payout date + multi-select filters + 11-column export).

### Phase 2: Bodyshop Tracker email (Stage A)

**Backend**

- [ ] Create `supabase/functions/bodyshop-earnings-report/index.ts`.
- [ ] Inputs: same test contract; `rows[]`:
  ```ts
  { employeeCode: string; employeeName: string; role: string; earnings: number; jcCount: number }[]
  ```
- [ ] Aggregate bank sheet: group by `employeeCode`, sum `earnings`.
- [ ] Detail sheet: one row per (role, employee) from client payload.

**Frontend** — [src/pages/BodyshopTrackerPage.tsx](../../../../src/pages/BodyshopTrackerPage.tsx)

- [ ] Add `canEditSharePercent` role check (copy from `TechnicianPage` / `SATrackerPage`).
- [ ] Add `allManpowerEmailRows` useMemo:
  - Iterate all `TABS` keys.
  - Filter `enrichedAccident` (SA) + `enrichedTechRows` (tech roles) with Range + branch filters.
  - Aggregate per (role, employee_code) matching `memberCards` logic.
- [ ] Add `sendBodyshopEarningsTestEmail()` to `email.ts`.
- [ ] Add `✉️ Email Report` in top toolbar (admin-only, Range-gated).

**Dependency:** BODYSHOP-EARNINGS-001 Phases 1–4 complete (solo bonus + support split) — ✅ implemented.

### Phase 3: Verification

- [ ] SA: Select Range on staging `/sa-tracker`; compare email Excel H column to sum of `saCards.totalIncome`.
- [ ] Bodyshop: Range covering known QA JCs from [BODYSHOP-EARNINGS-001_TEST_MATRIX](../bodyshop/evidence/BODYSHOP-EARNINGS-001_TEST_MATRIX.md); verify Detail sheet matches all 10 tabs.
- [ ] Bank lookup: employee with missing `employee_master` → empty F/G (document in runbook).
- [ ] RBAC: non-admin must not see button.
- [ ] `npm run build` clean.

### Phase 4: Evidence + runbook

- [ ] `docs/Implementation_plans/webversion/categories/operations/evidence/EARNINGS-EMAIL-002_TEST_MATRIX.md`
- [ ] `docs/Implementation_plans/webversion/categories/operations/evidence/runbooks/EARNINGS-EMAIL-002_SA_BODYSHOP_EMAIL_RUNBOOK.md`

---

## File Change List

| File | Action |
|------|--------|
| `supabase/functions/_shared/bankPayoutExcel.ts` | **Add** |
| `supabase/functions/technician-daily-earnings-report/index.ts` | **Modify** (use shared helper) |
| `supabase/functions/sa-earnings-report/index.ts` | **Add** |
| `supabase/functions/bodyshop-earnings-report/index.ts` | **Add** |
| `src/lib/api/email.ts` | **Modify** (add SA + bodyshop senders) |
| `src/pages/SATrackerPage.tsx` | **Modify** (email button + handler) |
| `src/pages/BodyshopTrackerPage.tsx` | **Modify** (admin gate + all-role aggregation + email button) |
| `docs/.../BODYSHOP-EARNINGS-001_*.md` | **Modify** (Phase 6 cross-link) |
| `docs/.../TECH-EARNINGS-001_*.md` | **Modify** (cross-link as reference) |

---

## Dependencies & Prerequisites

- [x] Technician email pattern audited and working in production.
- [x] Bodyshop earnings logic (BODYSHOP-EARNINGS-001 Phases 1–4).
- [ ] Supabase secrets: `SA_EARNINGS_TEST_RECIPIENTS`, `BODYSHOP_EARNINGS_TEST_RECIPIENTS`, `INTERNAL_EMAIL_DISPATCH_SECRET`.
- [ ] Finance sign-off on bodyshop two-sheet workbook layout.
- [ ] Optional parallel fix: `job_card_closed_data` dedupe (improves accuracy; not blocking WYSIWYG v1).

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| SA Payout modal vs Email Report confusion | Medium | Low | Different labels; document in runbook |
| Bodyshop all-role aggregation bug | Medium | High | Reuse same row pipeline as `memberCards`; test matrix |
| Same employee on multiple roles — double bank row | Low | High | Bank sheet sums by `employee_code` |
| Duplicate JC inflation | Medium | Medium | WYSIWYG + separate dedupe plan |
| Server-side drift if Stage B added later | Low | Medium | Defer Stage B; document client-rows contract |

---

## Success Criteria

- ✅ `/sa-tracker`: admin sees `✉️ Email Report`; enabled when Range set; email contains bank Excel matching `saCards` totals.
- ✅ `/bodyshop-tracker`: same UX; email contains all 10 role lanes; bank sheet one row per employee code.
- ✅ Excel columns A–M match technician contract on bank payout sheets.
- ✅ Non-admin users do not see the button.
- ✅ `npm run build` passes.

---

## Communication & Sign-Off

**Stakeholders:**

- [ ] Product Owner: _______________ (Date)
- [ ] Finance / Payroll: _______________ (Date) — Excel layout approval
- [ ] Operations Lead: _______________ (Date)
- [ ] Web Engineering Lead: _______________ (Date)

---

## Notes

### 2026-07-17 — Audit kickoff

- User request: parity with `/technician` Range-gated `✉️ Email Report` on `/sa-tracker` and `/bodyshop-tracker` for manpower earnings dispatch.
- SA already has local Excel via Payout Report modal but **no email** and **different Excel schema**.
- Bodyshop requires **cross-tab** aggregation (all manpower), not active-tab-only `memberCards`.
