# BODYSHOP-INSURER-001: Insurance Company Master (Settings + SA dropdown)

**Plan ID:** BODYSHOP-INSURER-001  
**Created:** 2026-09-04  
**Last Updated:** 2026-09-04  
**Priority:** MEDIUM  
**Owner:** Bodyshop Team + Platform Team + Accounts  
**Status:** Planned (do not implement until this phase is scheduled)  
**Platform:** webversion  
**Category:** bodyshop  
**Ledger:** DBL-0042 (PROPOSED — assign timestamp at apply; do not reuse DBL-0041)  
**Dump check:** `supabase/backups/full_metadata.sql` (2026-09-04 16:50 IST) has **no** `settings_insurance_companies` — expected until this phase is applied.  
**Depends on:** nothing. Does **not** change BODYSHOP-QUEUE-001, `Bodyshop-Flow.md`, or settlement money RPCs.  
**Related:** BODYSHOP-RECOVERY-001 (All insurers + Mismatch stay policy vs DMS bill-to); BODYSHOP-SETTLEMENT-001 (payer warning stays)  
**Evidence:** `docs/Implementation_plans/webversion/categories/bodyshop/evidence/BODYSHOP-INSURER-001_TEST_MATRIX.md`

---

## Executive Summary

SA **Insurance Company** is a free-text box. The same insurer is stored as HDFC / HDFC Ergo / ERGO HDFC. Recovery **All insurers** and Mismatch then look noisy.

This plan adds a **Settings master** (same idea as **Models**): one official name per company, aliases for Fetch and old cards, a dropdown on the SA tab, and Add in Settings when a new insurer appears.

**Do not implement in this chat.** Phases below are the later build order.

**Risk Level:** MEDIUM  
**Estimated Duration:** 1–2 days after Phase 0 sign-off  
**Rollback:** Drop catalog tables; revert Settings card and SA field to text. Card `insurance_company` text stays.

---

## Locked rules

1. **Two fields stay two fields.** `bodyshop_repair_cards.insurance_company` = policy company (who insured the vehicle). `bodyshop_settlements.invoice_account` / DMS `account` = bill-to (who was invoiced). Never copy bill-to into the policy field.
2. **DMS bill-to is not the Stage 1 value.** Invoice does not exist at Vehicle Receiving. Text after `C/O` is the customer, not the insurer. Official name is the stripped payer **before** `C/O`, minus `M/S` / `The`, then collapsed to one catalog row.
3. **Fetch stays RC.** `handleFetchInsuranceDetails` still fills policy no / valid-till / company from RC cache. Fetch **selects** a catalog row via alias match. If RC does not map, leave company blank and force a dropdown pick. Do not save the raw RC string.
4. **No typing** on SA Insurance Company after Phase 3. Dropdown of **active** catalog rows only. New names are added in Settings, not in the SA box.
5. **Do not seed 59 raw card spellings as 59 master rows.** Cards already have 59 distinct `insurance_company` values; DMS insurance payers (before `C/O`) are ~23 and still duplicate (e.g. ICICI LOMBARD vs ICICI LOMBARD GENERAL INSURANCE CO LTD). Phase 0 collapses to ~20 official names + aliases.
6. **Mismatch rule does not change.** Recovery orange pill / Mismatch filter / Stage 18 payer warning stay `insurerPayerMismatch(policy, bill_to)` (C/O + M/S stripped, first-token bidirectional). Catalog only makes the **policy** side consistent.
7. **Org-wide catalog.** `dealer_code = GLOBAL` like `settings_model_options`. Recovery is org-wide; do not scope insurers by dealer or branch.
8. **Do not** change BODYSHOP-QUEUE-001 projection, `Bodyshop-Flow.md`, settlement line RPCs, or Stage 18 money rules.

Snapshot 2026-09-04 (prod, planning only): 59 distinct card company strings; ~23 distinct DMS `account` payers with `INSURANCE` after strip.

---

## Recommended table (Phase 1)

Mirror Models. Names are indicative; lock in the migration at apply.

`public.settings_insurance_companies`

| Column | Role |
|---|---|
| `id` | PK |
| `dealer_code` | `GLOBAL` only (CHECK) |
| `company_name` | Official label shown in dropdowns |
| `sort_order` | Settings order |
| `is_active` | Hidden from SA dropdown when false; keep history |
| `created_by` / `created_at` / `updated_at` | Same as Models |

`public.settings_insurance_company_aliases`

| Column | Role |
|---|---|
| `id` | PK |
| `company_id` | FK to catalog, ON DELETE CASCADE |
| `alias` | Normalized unique (lower + trim). RC strings, old card spellings, stripped DMS payer spellings |

Unique on normalized active `company_name`. Unique on normalized `alias`. Settings RLS like Models (view for authorized; modify via Settings / admin). No new Employee Master business role.

`bodyshop_repair_cards.insurance_company` stays **text**. Do not add an FK in v1 (old unmatched strings must still load). Phase 4 may rewrite values to the official name.

---

## Phases (implement later, in order)

### Phase 0 — Inventory and collapse (no schema)

Read-only extract. Operator / Accounts signs the official list before any migration.

- [ ] **0.1** Distinct `bodyshop_repair_cards.insurance_company` (count + samples).
- [ ] **0.2** Distinct stripped DMS `psf_revenue_dms.account` (and/or `bodyshop_settlements.invoice_account`) before `C/O`, insurance payers only.
- [ ] **0.3** Collapse sheet: official name + aliases. Reject `… C/O <customer>` as a catalog name.
- [ ] **0.4** Accounts sign-off. Do not start Phase 1 without this list.

### Phase 1 — Master table (DBL-0042)

- [ ] **1.1** Ledger DBL-0042 PROPOSED → apply. Timestamp = next unused at apply (after `20260905183000` / DBL-0041). Do not re-run DBL-0008 / DBL-0037 / DBL-0041.
- [ ] **1.2** Migration: tables + normalize trigger + unique indexes + Settings-style RLS + GRANT.
- [ ] **1.3** Seed **only** the signed Phase 0 rows + aliases.
- [ ] **1.4** Paired `sql_checks`.

### Phase 2 — Settings card

- [ ] **2.1** Settings section **Insurance Companies** next to Models: list, add, rename, deactivate. Same UX as Models.
- [ ] **2.2** API in `src/lib/api/settings.ts` (`list` / `create` / `update`). Deactivate instead of hard-delete if any card still stores that name.
- [ ] **2.3** Adding a name here is the only way to introduce a new insurer.

### Phase 3 — SA dropdown + Fetch

- [ ] **3.1** Repair Tracker SA **Insurance Company**: `<select>` of active catalog names. Remove the text input.
- [ ] **3.2** Fetch: map RC `api_rc_vehicle_insurance_company_name` through aliases → official name. No map → blank + toast to pick.
- [ ] **3.3** Save still writes `insurance_company` text = official `company_name`.

### Phase 4 — Existing cards + Recovery labels (after Phase 3)

- [ ] **4.1** One-off: rewrite card `insurance_company` when an alias matches. Leave unmatched for Settings add + manual fix. Do not touch `invoice_account`.
- [ ] **4.2** Recovery **All insurers** options use official names (alias-grouped). Mismatch filter unchanged.

### Phase 5 — Evidence

- [ ] **5.1** Run `BODYSHOP-INSURER-001_TEST_MATRIX.md`.
- [ ] **5.2** Index / tracker / CHANGE_LOG / ledger APPLIED.

---

## Implementation Tasks (tracker)

- [ ] **Task 0:** Phase 0 extract + Accounts collapse sign-off.
- [ ] **Task 1:** DBL-0042 + sql_checks + seed.
- [ ] **Task 2:** Settings card + settings API.
- [ ] **Task 3:** SA dropdown + Fetch alias map.
- [ ] **Task 4:** Optional card remap + Recovery insurer options.
- [ ] **Task 5:** Test matrix + docs.

---

## Activity Tracker

```
⏳ 0.1 | Distinct card companies | Eng | - | - | Planning snapshot 59
⏳ 0.2 | Distinct stripped DMS payers | Eng | - | - | Planning snapshot ~23
⏳ 0.3 | Collapse official + aliases | Accounts + Eng | - | - | Block Phase 1
⏳ 0.4 | Sign-off | Accounts | - | - |
⏳ 1.1 | DBL-0042 migration | Eng | - | - | Timestamp at apply
⏳ 2.1 | Settings Insurance Companies | Eng | - | - | Like Models
⏳ 3.1 | SA dropdown + Fetch map | Eng | - | - | No free text
⏳ 4.1 | Remap old cards | Eng | - | - | Alias only
⏳ 5.1 | Test matrix | Eng | - | - |
```

---

## Out of this plan

- Changing Mismatch / payer-warning logic
- Writing DMS bill-to into `insurance_company`
- Mobile Repair Tracker company field (follow-up)
- New Employee Master role
- BODYSHOP-QUEUE-001 / `Bodyshop-Flow.md`
- Recovery customer-remaining book (still BODYSHOP-RECOVERY-001 Task 3.1)

---

## Apply notes (when this phase starts)

1. Finish Phase 0 sign-off first.
2. Pick the next unused migration timestamp that day.
3. Add/update ledger DBL-0042; do not reuse DBL-0041 (`20260905183000`).
4. Apply via `psql` from `.env.local`. Run paired sql_checks.
5. Then Settings + SA UI; Vercel only needed for the page.
