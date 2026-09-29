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
  ⚠️ **Audit finding F-C1:** `documents.tsx` still holds a local `repairCard` state (line 50) separate from the context. `isEffectiveMechanical` at line 69–72 is `(isMechanical || isMechanicalServiceType(activeServiceType)) && !repairCard && !isBodyshop`. Until `load()` populates local state, `repairCard === null` allows a bodyshop visit to briefly satisfy the mechanical branch. Use context's `repairCard` (from `useCustomerVisit()`) as the guard, not a second local copy. See Phase 6 fix Task 6.4.
- [ ] **Task 4.2:** `tracker.tsx` — mechanical five-phase journey from RPC; fix `isAccident` so open floor job is not treated as bodyshop because of an old repair card.  
  ⚠️ **Audit finding F-C2:** `tracker.tsx:252–253` computes `isAccident = isBodyshop || Boolean(card)` where `card` is local state. If a vehicle has a closed accident repair card in DB, `Boolean(card)` is `true` even for a new mechanical visit, forcing bodyshop journey. The context's `isBodyshop` is the authoritative source; `Boolean(card)` is redundant. See Phase 6 fix Task 6.3.
- [ ] **Task 4.3:** Remove direct supabase `technician_assignments` read from customer tracker; use RPC floor block only.

### Phase 5: Payments + regression
- [ ] **Task 5.1:** `invoices.tsx` — mechanical branch loads `customer_get_mechanical_case`; do not use bodyshop settlement for active mechanical visit.  
  ⚠️ **Audit finding F-C3:** `invoices.tsx:116–125` derives `isAccidentalCase` from payment data independently of the visit context. If a vehicle had a past bodyshop settlement, `isAccidentalCase=true` even when `isMechanicalVisit=true`. The branch guards at lines 190 and 205 then produce **a silent blank screen** (mechanical branch requires `!repairCard`; bodyshop branch requires `!isMechanicalVisit` — neither fires). Fix: derive branch solely from context `isBodyshop`/`isMechanicalVisit`. See Phase 6 fix Task 6.5.
- [ ] **Task 5.2:** `gatepass.tsx` — no behaviour change; confirm mechanical gate pass still loads via existing `customer_get_gate_pass`.
- [ ] **Task 5.3:** Regression: Accident registration unchanged (18 stages, claim docs, insurance settlement).
- [ ] **Task 5.4:** Regression: same reg with old repair card + new open Paid Service or **Mini Paid Service** → mechanical screens.
- [ ] **Task 5.5:** Device verification checklist (section Success Criteria) on real customer sessions.

### Phase 6: Post-audit fixes (added 2026-09-29)

> These tasks correct defects discovered during the 2026-09-29 audit. All Phase 1–5 code was shipped 2026-09-26 by Mobile Team + Platform. Root causes are detailed in the **Post-Implementation Audit** section below.

- [ ] **Task 6.1** *(Mobile — `customerPortal.ts`)* **Remove `|| true` debug artifact — CRITICAL:** `mobile/src/lib/api/customerPortal.ts` ~line 749 has `|| true` at the end of the `isInsuranceClaim` assignment. This makes every non-cash bodyshop settlement object claim `is_insurance_claim: true`, forcing full insurance UI for every bodyshop vehicle. Remove the `|| true`. The real conditions (`doAmount > 0 || Boolean(bsCard.insurance_company) || Boolean(bsCard.claim_intimation_no)`) are correct and sufficient.

- [ ] **Task 6.2** *(Mobile — `customerPortal.ts`)* **Bodyshop settlement path must not activate for mechanical visits with past repair card:** `customerGetSettlement` uses `const useBodyshopPath = bsCard && (!entry || !entryIsMechanical) && bsTime > 0`. If a vehicle had an accident repair and returns for mechanical service with no new reception entry yet, `entry` is null and `useBodyshopPath` becomes true — old bodyshop settlement shown. Fix: when `visit_kind` is `mechanical` in the visit context, short-circuit to the mechanical branch regardless of `bsCard` presence.

- [ ] **Task 6.3** *(Mobile — `tracker.tsx`)* **Remove `Boolean(card)` from `isAccident` guard:** `tracker.tsx:252–253` computes `isAccident = isBodyshop || Boolean(card)`. Remove the `Boolean(card)` term. `isBodyshop` from `useCustomerVisit()` is already authoritative; a stale local repair card variable must not override the server-resolved visit kind. Also confirm `isEffectiveMechanical = !isAccident && isMechanicalVisit` still works after removal.

- [ ] **Task 6.4** *(Mobile — `documents.tsx`)* **Remove local `repairCard` state; use context exclusively for branch guard:** `documents.tsx` declares `const [repairCard, setRepairCard] = useState(null)` (line 50) and uses it in `isEffectiveMechanical`. Replace with `const { repairCard } = useCustomerVisit()`. Remove the local state and any `setRepairCard` calls in `load()`. The branch condition becomes `isMechanical && !isBodyshop && !repairCard` using all context values, matching `index.tsx` (the correct reference).  
  Also fix the TOCTOU in `load()` at line 131–133: replace stale `isMechanical` check with the fresh `activeKind` returned by `refreshVisit()`.

- [ ] **Task 6.5** *(Mobile — `invoices.tsx`)* **Derive branch from context visit kind, not payment data heuristic:** Remove `isAccidentalCase` computed from payment fields. Replace all branch guards with context values: `isMechanicalVisit && !isBodyshop` → mechanical UI; `isBodyshop && !isMechanicalVisit` → bodyshop settlement UI; fallback → neutral state. Ensure the case where `mechCase` is null while `isMechanicalVisit` is true shows a clean "billing not yet available" message, not the outdated "database update required" placeholder.

- [ ] **Task 6.6** *(Mobile — `CustomerVisitContext.tsx`)* **Guard `ready` flag on error:** Context sets `ready: true` even when the first `refresh()` call errors, leaving all context values null/other and causing mechanical vehicles to flash bodyshop UI. Add a `hasData` guard: only set `ready: true` when the RPC returned a non-error payload. On error, keep `ready: false` and expose an `error` field so screens can show a retry prompt rather than wrong content.

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
⚠️ 4.1 | Mechanical Documents | Mobile | 2026-09-26 | 2026-09-26 | local repairCard state diverges from context — isEffectiveMechanical wrong during load; fixed by 6.4
⚠️ 4.2 | Mechanical Journey | Mobile | 2026-09-26 | 2026-09-26 | isAccident = isBodyshop || Boolean(card) — old card forces bodyshop journey; fixed by 6.3
✅ 4.3 | No technician_assignments on mechanical path | Mobile | 2026-09-26 | 2026-09-26 | tracker.tsx
```

### Phase 5
```
⚠️ 5.1 | Mechanical Payments | Mobile | 2026-09-26 | 2026-09-26 | isAccidentalCase from payment data causes silent blank screen on same-reg vehicles; fixed by 6.5
⏳ 5.2 | Gate pass smoke | Mobile | | | needs applied migration + live JC
⏳ 5.3 | Accident regression | Mobile | | | BLOCKED until 6.1 (|| true bug) fixed
⏳ 5.4 | Old repair card + new mechanical job | Mobile | | | BLOCKED until 6.2, 6.3, 6.4, 6.5 fixed
⏳ 5.5 | Live customer verification | Mobile + Platform | | |
```

### Phase 6 (post-audit fixes — added 2026-09-29)
```
⏳ 6.1 | Remove || true from isInsuranceClaim — CRITICAL | Mobile | | | customerPortal.ts ~749; all bodyshop treated as insurance
⏳ 6.2 | Bodyshop settlement bypass for mechanical visit | Mobile | | | customerPortal.ts useBodyshopPath guard
⏳ 6.3 | Remove Boolean(card) from isAccident in tracker | Mobile | | | tracker.tsx:252–253
⏳ 6.4 | Remove local repairCard state in documents.tsx | Mobile | | | use context repairCard; fix TOCTOU on activeKind
⏳ 6.5 | invoices.tsx branch from context not payment data | Mobile | | | remove isAccidentalCase heuristic
⏳ 6.6 | CustomerVisitContext ready guard on error | Mobile | | | CustomerVisitContext.tsx; ready only on non-error payload
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
  *(Blocked by F-C1 — local repairCard state; fix: Task 6.4)*
- [ ] Journey phase 3 matches Floor Incharge `work_status` for that JC (via RPC).  
  *(Blocked by F-C2 — Boolean(card) in isAccident; fix: Task 6.3)*
- [ ] After Accounts saves invoice, billed/remaining/receipts match `/accounts` Mechanical for that JC.  
  *(Blocked by F-C3 — isAccidentalCase heuristic causes blank screen; fix: Task 6.5)*
- [ ] Gate pass button only after Accounts issues mechanical gate pass.
- [ ] Active **Accident** visit on same app build still shows 18-stage journey, claim documents, and insurance settlement.  
  *(Blocked by F-B — `|| true` bug makes all bodyshop appear as insurance; fix: Task 6.1)*
- [ ] Registration with historical repair card + newer open Paid Service uses mechanical screens.  
  *(Blocked by F-C2, F-C3; fix: Tasks 6.2, 6.3, 6.5)*

---

## Communication & Sign-Off

**Stakeholders:**
- [ ] Mobile: _______________ (Signature) (Date)
- [ ] Platform: _______________ (Signature) (Date)
- [ ] Product: _______________ (Signature) (Date)

---

## Post-Implementation Audit Findings

> Audit conducted: 2026-09-29. All Phase 1–5 code was shipped 2026-09-26 by Mobile Team + Platform.

### F-B — `|| true` debug artifact makes all bodyshop vehicles appear as insurance claims — CRITICAL
**File:** `mobile/src/lib/api/customerPortal.ts` ~line 749  
**Who:** Mobile Team — MOBILE-015, 2026-09-26  
**What:** `const isInsuranceClaim = !isCashCase && (...conditions... || true)`. The trailing `|| true` makes the parenthesised expression always `true` for any non-cash bodyshop vehicle. Every bodyshop settlement object therefore has `is_insurance_claim: true`, forcing the full insurance settlement UI (DO amount, insurer, difference amount) for every bodyshop visit regardless of whether it actually has an insurance claim. This is almost certainly a debugging shortcut committed by mistake. Fix: Task 6.1 — remove `|| true`.

### F-C1 — `documents.tsx` local `repairCard` state diverges from context during load
**File:** `mobile/src/app/(customer)/documents.tsx:50, 69–72`  
**Who:** Mobile Team — MOBILE-015, 2026-09-26  
**What:** The screen maintains its own `const [repairCard, setRepairCard] = useState(null)` alongside the context's `repairCard`. `isEffectiveMechanical` uses the local state: until `load()` populates it, a bodyshop visit has `repairCard === null`, satisfying the mechanical branch briefly. `index.tsx` (the reference implementation) uses only context values for the same branch and is correct. Fix: Task 6.4.

### F-C2 — `tracker.tsx` old repair card forces bodyshop journey for mechanical visits
**File:** `mobile/src/app/(customer)/tracker.tsx:252–253`  
**Who:** Mobile Team — MOBILE-015, 2026-09-26  
**What:** `isAccident = isBodyshop || Boolean(card)`. If a vehicle ever had an accident repair, `card` is populated from `customerGetRepairCard`. For a vehicle now in for Paid Service, context correctly sets `isBodyshop=false`, but `Boolean(card)` is `true`, making `isAccident=true` and rendering the 18-stage bodyshop journey instead of the 5-phase mechanical journey. The plan's locked rule 2 ("active visit wins; historical repair card does not make a current Paid Service visit an accident") is violated. Fix: Task 6.3.

### F-C3 — `invoices.tsx` derives visit kind from payment data, causing silent blank screen
**File:** `mobile/src/app/(customer)/invoices.tsx:116–125, 190, 205`  
**Who:** Mobile Team — MOBILE-015, 2026-09-26  
**What:** `isAccidentalCase` is computed from payment fields (`is_insurance_claim`, `insurance_company`, `do_amount`, etc.) independently of the context visit kind. For a vehicle with a past bodyshop settlement now returning for mechanical service: `isAccidentalCase=true` AND `isMechanicalVisit=true`. The mechanical branch (line 190) requires `!repairCard` — the bodyshop settlement satisfies `repairCard` so mechanical content does not render. The bodyshop branch (line 205) requires `!isMechanicalVisit` — also false. **Neither branch renders.** The customer sees a blank Payments screen. Fix: Task 6.5.

### F-C4 — `CustomerVisitContext` sets `ready=true` on first call even when it errored
**File:** `mobile/src/context/CustomerVisitContext.tsx` (line ~after first refresh)  
**Who:** Mobile Team — MOBILE-015, 2026-09-26  
**What:** After the first `refresh()` call, `ready: true` is set regardless of success or failure. If the first call errors, all context values remain null/`'other'`, and every screen that gates on `visitReady` will proceed with wrong defaults (bodyshop fallback for a mechanical vehicle). Fix: Task 6.6.

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

### 2026-09-29 — Post-implementation audit
- Four mobile defects found; none require SQL changes.
- Most critical: `|| true` in `customerPortal.ts` (F-B) — corrupts settlement classification for every bodyshop vehicle. Fix this first.
- Fix order: 6.1 (`|| true` removal) → 6.2 (settlement bypass) → 6.3 (tracker isAccident) → 6.4 (documents.tsx local state) → 6.5 (invoices branch) → 6.6 (context ready guard).
- Root pattern: three screens (documents, tracker, invoices) maintained local copies of data the context already owns, creating TOCTOU races and stale-data overrides. `index.tsx` is the correct reference: all branch decisions from context, no local state copies.

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

**Last Updated:** 2026-09-29 — post-implementation audit; Phase 6 fix tasks added  
**Status:** 🔴 DEFECTS FOUND — Phase 6 fixes required; device QA BLOCKED until Tasks 6.1–6.5 are applied (critical: `|| true` bug breaks all bodyshop settlement, blank Payments screen on same-reg vehicles)
