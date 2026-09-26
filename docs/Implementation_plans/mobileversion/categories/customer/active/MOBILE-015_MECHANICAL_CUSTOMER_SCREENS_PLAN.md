# Implementation Plan: MOBILE-015

**Plan ID:** MOBILE-015  
**Created:** 2026-09-26  
**Priority:** HIGH  
**Owner:** Mobile Team + Platform  
**Status:** In progress (apply migrations `20260926153000` + `20260926163000` before live QA)  
**Category:** customer  
**DB authority:** `supabase/backups/full_metadata.sql`  
**Web desk reference:** [ACCOUNTS-001](../../../../webversion/categories/accounts/active/ACCOUNTS-001_MECHANICAL_BODYSHOP_ACCOUNTS_DESK_PLAN_2026-09-11.md) (`/accounts`)  
**Customer shell:** [MOBILE-011](../../auth/active/MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md)  
**Accident screens stay:** [MOBILE-013](MOBILE-013_CUSTOMER_DOCUMENT_DRIVE_UPLOAD_PLAN.md), [MOBILE-014](MOBILE-014_CUSTOMER_ADVISOR_CHAT_PLAN.md)

---

## Executive Summary

Login as Customer today is built around Accident repair: claim documents, 18-stage journey, insurance settlement, and bodyshop hero copy. Floor Incharge visits (Paid Service, free services, Running Repairs, **Mini Paid Service**, Campaign, and the rest of the mechanical desk) already flow through reception, floor assignment, Service Advisor Mark Done, and Accounts mechanical invoice capture on the server. The mobile app does not branch on that visit type, so a mechanical customer still sees accident UI and can hit dead-end claim uploads.

This plan adds a mechanical customer path on the same five tabs (Home, Documents, Journey, Payments, Help). One session RPC returns floor status, invoice, receipts, and file links. Screens branch on the **active reception row** service type. Accident visits keep the current bodyshop screens unchanged.

**Risk Level:** 🟡 MEDIUM  
**Estimated Duration:** 3–4 working days  
**Rollback Strategy:** Drop `customer_get_mechanical_case` and revert the app branch. Mechanical customers fall back to today’s generic screens. Keep any `is_floor_incharge_service_type` migration if Accounts and Floor Incharge already depend on Mini Paid Service in production.

---

## Objectives

1. Active mechanical visit: customer sees mechanical Home, Documents, Journey, and Payments. No claim upload, insurance settlement card, surveyor block, or 18-stage repair journey.
2. Active Accident visit: existing bodyshop customer screens unchanged on all tabs.
3. Journey for mechanical visits reflects reception, `technician_assignments`, Mark Done, Accounts billed amount, and issued gate pass. No inferred steps from “JC exists”.
4. Payments for mechanical visits read `accounts_mechanical_invoices` and `accounts_mechanical_payment_lines` for the **current** visit, not an old bodyshop settlement on the same registration.
5. `is_floor_incharge_service_type` includes **Mini Paid Service** so customer RPC, Accounts mechanical desk, and `src/lib/api/reception.ts` use one mechanical allowlist.

---

## Context & Background

Audit date: 2026-09-26. DB authority: `supabase/backups/full_metadata.sql`.

### Workshop split (web `/accounts`)

| | Mechanical | Bodyshop (Accident) |
|---|---|---|
| Service types | Running Repairs, First / Second / Third Free Service, Paid Service, **Mini Paid Service**, Updation, E Breakdown, Campaign | `Accident` (repair card at reception) |
| Path | Reception → Floor Incharge → SA Mark Done → Accounts invoice | 18-stage `bodyshop_repair_cards` |
| Money | `accounts_mechanical_invoices` + `accounts_mechanical_payment_lines` | `bodyshop_settlements` + lines (DO + customer diff) |
| Gate pass | `issue_accounts_mechanical_gatepass` → `customer_gatepass_payload` | After customer settlement |
| Customer files | Estimate + tax invoice on `service_reception_entries` | Claim docs on `bodyshop_repair_card_documents` |

Rusting and PDI are not mechanical customer flows in this plan.

### Mechanical allowlist (single source after Phase 1)

Match `src/lib/api/reception.ts` `FLOOR_INCHARGE_ALLOWED_SERVICE_TYPES`:

- Running Repairs  
- First Free Service  
- Second Free Service  
- Third Free Service  
- Paid Service  
- **Mini Paid Service**  
- Updation  
- E Breakdown  
- Campaign  

Customer classification uses **`customer_resolve_visit_kind`** on the active job row (same rules as `is_floor_incharge_service_type` + Accident/bodyshop source). The mobile app must not infer visit type from the vehicle list or from “any repair card on this reg”.

### What Login as Customer does today

| Surface | Accident (keep) | Mechanical today |
|---|---|---|
| `mobile/src/app/(customer)/index.tsx` | Bodyshop hero, claim/surveyor rows, `RemainingDocumentsCard` | Same accident chrome; insurance fields usually blank |
| `mobile/src/app/(customer)/documents.tsx` | Claim slots / cash “no documents” | `claimModeFromRepairCard(null)` → insurance; upload needs repair card → fails |
| `mobile/src/app/(customer)/tracker.tsx` | 18 stages from repair card | `isAccident` true if **any** repair card exists; else guessed 6 steps; direct `technician_assignments` query blocked by RLS |
| `mobile/src/app/(customer)/invoices.tsx` | Insurance settlement UI | `customer_get_settlement` prefers bodyshop settlement; `reception_expected` shows estimate as due |
| Help, chat, booking, complaint, feedback | Shared | Shared — no change |

`customer_get_settlement` already has a mechanical branch but must not drive Payments when the active visit is mechanical and an old accident settlement exists on the same reg.

---

## Locked rules

1. Bottom tabs stay: Home, Documents, Journey, Payments, Help. No new tab.
2. **Active visit wins:** classify from the same reception row `customer_get_active_job` prefers (open first, then latest). A historical repair card does not make a current Paid Service visit an accident.
3. **Mechanical** := `is_floor_incharge_service_type(active_job.service_type)` (includes Mini Paid Service after Phase 1).
4. **Bodyshop** := active job is `Accident`, or no reception row and bodyshop card is the visit source.
5. Mechanical Payments call `customer_get_mechanical_case`, not `customer_get_settlement`.
6. Customer does not pay in-app. Show Accounts-posted receipts only.
7. Do not expose `payment_notes`, Keep on Credit reason, voucher numbers, or internal floor remarks to the customer.
8. Chat, Call advisor, Helpdesk, Book service, Report issue, Feedback stay for both visit types.

---

## Target contract

### Classification (server-owned)

```text
visit_kind := customer_resolve_visit_kind(active_job)
  mechanical := is_floor_incharge_service_type(active_job.service_type)
  bodyshop   := source = bodyshop OR service_type Accident / accident substring
  other      := Rusting, PDI, no visit — generic screens
```

**RPCs**

| RPC | Role |
|-----|------|
| `customer_get_active_job` | Returns `job`, `vehicle`, and top-level **`visit_kind`**. |
| `customer_get_visit_context` | One round trip: active job + `visit_kind` + **`mechanical_case`** or **`repair_card`** (never both). Requires non-empty `p_reg_number`. |
| `customer_get_mechanical_case` | Mechanical Payments/Journey detail when context already loaded or tab refresh needs fresh invoice lines. |

**Mobile:** `CustomerVisitProvider` calls `customerGetVisitContext(selectedReg)` only — no parallel `customerGetRepairCard` on mechanical login, no client-only classification when `visit_kind` is present. `mechanicalServiceType.ts` keeps a fallback mirror for pre-migration RPCs.

### Login regression fix (2026-09-26)

**Symptom:** After customer login, Home briefly showed bodyshop (insurance, surveyor, claim docs) until hard refresh.

**Cause:** Client inferred bodyshop from stale repair card / default `other` + bodyshop UI gates; `customer_get_active_job` without reg picked wrong job; home fetched repair card in parallel.

**Fix:** Session-scoped `CustomerVisitProvider`, mandatory reg on portal cache keys, Home waits on `visitReady`, and **server `visit_kind` + bundled visit context** (migration `20260926163000`).

### Screen behaviour (mechanical only)

**Home**

- Hero: service type label (e.g. Paid Service, Mini Paid Service), not “Accidental & bodyshop care”.
- Status chip from: no JC → checked in; floor `work_inprocess` / `hold` / `completed`; Mark Done; billed / payment due; gate pass issued.
- Workshop record: JC, service type, SA, km, technician, bay. Hide claim intimation, insurer, policy, surveyor.
- Hide `RemainingDocumentsCard` and bodyshop primary actions (upload docs, approve estimate).
- Keep Chat and Call advisor.

**Documents**

- Read-only: workshop estimate and tax invoice from reception `estimate_*` / `invoice_*` URLs or storage paths.
- No claim upload, damage-photo claim section, or insurance “From Techwheels” bundle.

**Journey**

- Five phases only (not 18): Received → Job card → Workshop (floor `work_status`) → Billing (`billed_amount`) → Collection (gate pass payload).
- Data from `customer_get_mechanical_case`. Remove customer direct select on `technician_assignments`.

**Payments**

- Before Accounts `billed_amount`: “Bill not raised yet”; show `expected_invoice_amount` as **Estimate**, not due.
- After capture: billed, received, remaining, `payment_status`, receipt lines (mode, date, reference).
- Gate pass CTA only when `customer_get_gate_pass` returns a pass.
- No insurance DO / customer-diff UI.

**Menu (`CustomerScreen.tsx`)**

- Hide for mechanical: Upload Claim Documents, Workshop Estimate Approval, Download Insurance Claim Form, Download T/P Affidavit.

**Help**

- Unchanged.

### Database RPC

`customer_get_mechanical_case(p_session_token, p_reg_number) → jsonb`

- `SECURITY DEFINER`, session + `customer_assert_reg`.
- Returns `null` if active reception row is missing or not a floor service type.
- Payload: visit fields, estimate/invoice file links, latest floor assignment for JC, mechanical invoice header, payment lines (no voucher_no).
- Paired `supabase/sql_checks/`. Refresh `full_metadata.sql` after apply.

Phase 1 also updates `is_floor_incharge_service_type` to include `'Mini Paid Service'`.

---

## Implementation Tasks

### Phase 1: Database — mechanical allowlist + customer read RPC
- [ ] **Task 1.1:** Migration: extend `is_floor_incharge_service_type` with `'Mini Paid Service'`. Paired sql_checks prove Mini Paid rows qualify for mechanical Accounts/Floor rules where that function is used.
- [ ] **Task 1.2:** Create `customer_get_mechanical_case` per target contract. Grant to `anon` and `authenticated` like other customer RPCs.
- [ ] **Task 1.3:** sql_checks: wrong phone/reg rejected; expired session rejected; floor visit returns technician fields without `payment_notes` / keep_on_credit columns.
- [ ] **Task 1.4:** Refresh `supabase/backups/full_metadata.sql` after operator apply.

### Phase 2: Visit context in the app
- [ ] **Task 2.1:** Add `mechanicalServiceType.ts` with the nine-type allowlist (same as `reception.ts`).
- [ ] **Task 2.2:** Add `customerGetMechanicalCase` and **`customerGetVisitContext`** wrappers in `mobile/src/lib/api/customerPortal.ts`.
- [ ] **Task 2.3:** `CustomerVisitProvider` + `useCustomerVisit()` on Home, Documents, Journey, Payments, menu — **server `visit_kind`**, no vehicle-list routing.
- [ ] **Task 2.4:** Migration `20260926163000`: `customer_resolve_visit_kind`, extend `customer_get_active_job`, add `customer_get_visit_context`. Paired sql_checks.

### Phase 3: Home + menu
- [ ] **Task 3.1:** `index.tsx` — mechanical hero, status chip, trimmed workshop record; hide claim rows and `RemainingDocumentsCard` when mechanical.
- [ ] **Task 3.2:** `CustomerScreen.tsx` — filter overflow menu items for mechanical visits.

### Phase 4: Documents + Journey
- [ ] **Task 4.1:** `documents.tsx` — mechanical branch: two read-only file rows; skip claim uploader and `DamagePhotosSection` / claim progress when mechanical.
- [ ] **Task 4.2:** `tracker.tsx` — mechanical five-phase journey from RPC; fix `isAccident` so open floor job is not treated as bodyshop because of an old repair card.
- [ ] **Task 4.3:** Remove direct supabase `technician_assignments` read from customer tracker; use RPC floor block only.

### Phase 5: Payments + regression
- [ ] **Task 5.1:** `invoices.tsx` — mechanical branch loads `customer_get_mechanical_case`; do not use bodyshop settlement for active mechanical visit.
- [ ] **Task 5.2:** `gatepass.tsx` — no behaviour change; confirm mechanical gate pass still loads via existing `customer_get_gate_pass`.
- [ ] **Task 5.3:** Regression: Accident registration unchanged (18 stages, claim docs, insurance settlement).
- [ ] **Task 5.4:** Regression: same reg with old repair card + new open Paid Service or **Mini Paid Service** → mechanical screens.
- [ ] **Task 5.5:** Device verification checklist (section Success Criteria) on real customer sessions.

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
✅ 1.1 | Mini Paid Service in is_floor_incharge_service_type | Platform | 2026-09-26 | 2026-09-26 | 20260926153000 migration
✅ 1.2 | customer_get_mechanical_case RPC | Platform | 2026-09-26 | 2026-09-26 | same migration
✅ 1.3 | Paired sql_checks | Platform | 2026-09-26 | 2026-09-26 | sql_checks file added
✅ 1.4 | Refresh full_metadata.sql (visit_kind RPCs) | Platform | 2026-09-26 | 2026-09-26 | restore + patch; apply 1530 migration for mechanical_case in DB
```

### Phase 2
```
✅ 2.1 | mechanicalServiceType.ts | Mobile | 2026-09-26 | 2026-09-26 |
✅ 2.2 | customerPortal wrappers | Mobile | 2026-09-26 | 2026-09-26 | mech case + visit context
✅ 2.3 | CustomerVisitProvider | Mobile | 2026-09-26 | 2026-09-26 | useCustomerVisit
✅ 2.4 | visit_kind + visit_context SQL | Platform | 2026-09-26 | 2026-09-26 | 20260926163000
```

### Phase 3
```
✅ 3.1 | Mechanical Home | Mobile | 2026-09-26 | 2026-09-26 | index.tsx
✅ 3.2 | Mechanical menu filter | Mobile | 2026-09-26 | 2026-09-26 | CustomerScreen.tsx
```

### Phase 4
```
✅ 4.1 | Mechanical Documents | Mobile | 2026-09-26 | 2026-09-26 |
✅ 4.2 | Mechanical Journey | Mobile | 2026-09-26 | 2026-09-26 | MechanicalJourneyContent
✅ 4.3 | No technician_assignments on mechanical path | Mobile | 2026-09-26 | 2026-09-26 | tracker.tsx
```

### Phase 5
```
✅ 5.1 | Mechanical Payments | Mobile | 2026-09-26 | 2026-09-26 |
⏳ 5.2 | Gate pass smoke | Mobile | | | needs applied migration + live JC
⏳ 5.3 | Accident regression | Mobile | | | device QA
⏳ 5.4 | Old repair card + new mechanical job | Mobile | | | device QA
⏳ 5.5 | Live customer verification | Mobile + Platform | | |
```

---

## Dependencies & Prerequisites

- [x] Customer session RPCs (`customer_get_active_job`, `customer_get_repair_card`, `customer_get_settlement`, `customer_get_gate_pass`) in `full_metadata.sql`.
- [x] Accounts mechanical tables and `issue_accounts_mechanical_gatepass` (ACCOUNTS-001).
- [x] MOBILE-011 customer login and `(customer)` route group shipped in `mobile/`.
- [ ] Operator applies Phase 1 migration before mechanical Payments/Journey QA against live invoice rows.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Old bodyshop settlement shown on mechanical visit | High today | High | Payments use `customer_get_mechanical_case` only when visit kind is mechanical |
| Open Accident misclassified because of stale repair card | Medium | High | Classify from **active** reception row, not repair card presence |
| Mini Paid Service customer sees accident UI until Phase 1 applies | Medium | Medium | Phase 1 adds Mini Paid to `is_floor_incharge_service_type`; app uses same nine-type list |
| Customer queries `technician_assignments` directly | High today | Medium | Phase 4.3; all floor fields from RPC |
| `expected_invoice_amount` shown as amount due | Medium | Medium | Label Estimate until `billed_amount` exists |

---

## Success Criteria

- [ ] Customer with active **Mini Paid Service** (or any floor type) sees mechanical Home copy and no claim-document card.
- [ ] Documents tab for mechanical visit: estimate/invoice view only; no claim upload slots.
- [ ] Journey phase 3 matches Floor Incharge `work_status` for that JC (via RPC).
- [ ] After Accounts saves invoice, billed/remaining/receipts match `/accounts` Mechanical for that JC.
- [ ] Gate pass button only after Accounts issues mechanical gate pass.
- [ ] Active **Accident** visit on same app build still shows 18-stage journey, claim documents, and insurance settlement.
- [ ] Registration with historical repair card + newer open Paid Service uses mechanical screens.

---

## Communication & Sign-Off

**Stakeholders:**
- [ ] Mobile: _______________ (Signature) (Date)
- [ ] Platform: _______________ (Signature) (Date)
- [ ] Product: _______________ (Signature) (Date)

---

## Notes & Lessons Learned

> Add notes here as work progresses.

### 2026-09-26 — Kickoff
- Customer app is accident-first; mechanical server path is complete through Accounts.
- Mini Paid Service is mechanical; Phase 1 aligns SQL `is_floor_incharge_service_type` with reception allowlist.
- Help tab and MOBILE-014 chat stay shared; do not fork helpdesk RPCs.

### 2026-09-26 — Server visit contract
- Added `customer_resolve_visit_kind`, `customer_get_visit_context`, and `visit_kind` on `customer_get_active_job`.
- Mobile visit shell loads one bundled context per selected reg; fixes bodyshop flash on mechanical login.

---

## Related Documentation

- [ACCOUNTS-001](../../../../webversion/categories/accounts/active/ACCOUNTS-001_MECHANICAL_BODYSHOP_ACCOUNTS_DESK_PLAN_2026-09-11.md)
- [MOBILE-011](../../auth/active/MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md)
- [MOBILE-013](MOBILE-013_CUSTOMER_DOCUMENT_DRIVE_UPLOAD_PLAN.md)
- [MOBILE-014](MOBILE-014_CUSTOMER_ADVISOR_CHAT_PLAN.md)
- [Customer category README](../README.md)
- [Mobile index](../../../INDEX.md)
- [Mobile tracker](../../../IMPLEMENTATION_TRACKER.md)
- Mechanical allowlist: `src/lib/api/reception.ts`
- Customer tabs: `mobile/src/app/(customer)/_layout.tsx`
- DB truth: `supabase/backups/full_metadata.sql`

---

**Last Updated:** 2026-09-26  
**Status:** In progress — mechanical screens + server visit_kind shipped in repo; operator apply migrations before device QA
