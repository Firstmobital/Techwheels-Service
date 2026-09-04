# BODYSHOP-SETTLEMENT-001: Payment Reconciliation Ledger (Invoice / DO / Customer)

**Plan ID:** BODYSHOP-SETTLEMENT-001  
**Created:** 2026-09-04  
**Last Updated:** 2026-09-04 (Posted entries show optional Reference/Remark; post forms capture it)  
**Priority:** HIGH  
**Owner:** Bodyshop Team + Platform Team + Accounts  
**Status:** Active (implementation in progress; DBL-0026 VERIFIED in `full_metadata.sql`; DBL-0029 APPLIED)  
**Platform:** webversion  
**Category:** bodyshop  
**Ledger:** DBL-0026 (VERIFIED); DBL-0029 (APPLIED — post-DO 400)  
**Reference pages:** `/bodyshop-repair` (Billing tab stages 15/16; **Stage 18 Payment** = two payment statuses)  
**DB authority:** `supabase/backups/full_metadata.sql` (dumped 2026-09-04 13:05 IST; sha256 `074311759167fd4049087061f1df4d3452729625a089a216425240c79d89041a`)  
**Row-data authority:** live production (4 Sep 2026) + `local_folder/backups/chunks/full_database.sql.part_*`  
**Investigation canvas:** `/Users/vkbin/.cursor/projects/Users-vkbin-Techwheels-Service/canvases/jc-005071-payment-reconciliation.canvas.tsx`  
**Evidence:** `docs/Implementation_plans/webversion/categories/bodyshop/evidence/BODYSHOP-SETTLEMENT-001_TEST_MATRIX.md`

---

## Executive Summary

Bodyshop billing today stores four overwriteable scalars on `bodyshop_repair_cards`: `billed_amount`, `do_amount`, `customer_diff_amount`, `payment_status` (`pending` / `received` / `not_received`). That cannot support accounts reconciliation.

Stage 18 today has **one** Payment Status dropdown. That is the accounts break. Stage 18 must have **two** payment statuses:

1. **DO Payment Status** — user posts **Main + GST + TDS** received against the DO. Remainder is **insurance due**.
2. **Customer Diff Payment Status** — user posts what was paid or refunded against `customer_diff = invoice − DO`. Sign decides the label: positive = **Recoverable from customer**; negative = **Customer Refund**.

This plan adds an **append-only settlement ledger**. Card billing columns (plus two new derived status columns) stay a **cache** so BODYSHOP-QUEUE-001 keeps reading the card. Neither Stage 18 status is typed by dropdown.

**Anchor case:** `JC-MBTPLT-JP1-2627-005071` / `RJ52UA9900` — invoice `IMBTAI2627006673` ₹1,71,793.30 fully outstanding in DMS; card shows DO ₹1,42,995 and Payment Received.

**Risk Level:** HIGH  
**Estimated Duration:** 8–12 working days  
**Rollback Strategy:** Drop new tables/RPCs/triggers; restore prior Billing tab save path; card scalars remain. Do not delete backfilled headers until Accounts sign-off.  
**Deploy:** Preview / staging first. No production apply until DBL-0026 sql_checks pass and Accounts signs the golden case.

---

## Objectives

1. Split Stage 18 into **DO Payment Status** and **Customer Diff Payment Status** (two derived pills, never one dropdown).
2. Capture DO releases as **Main / GST / TDS** lines; derive **insurance due**.
3. Capture customer receipts or refunds; derive remaining due or remaining refund from the sign of customer diff.
4. Keep stages 15/16 as invoice + DO capture on the Billing tab; Stage 18 is the payment surface.
5. Keep queue logic via card cache. Overall `payment_status = received` only when **both** component statuses are received.
6. Mobile must use the same two-status contract.

---

## Authoritative Audit (`full_metadata.sql` + live rows 2026-09-04)

**Pre-apply audit** (morning 2026-09-04) is kept below as the gap that justified DBL-0026. It is not current schema truth.

**Post-apply schema authority** — `supabase/backups/full_metadata.sql` regenerated 2026-09-04 13:05 IST (`supabase/evidence/authoritative_metadata_manifest.json` sha256=`074311759167fd4049087061f1df4d3452729625a089a216425240c79d89041a`):

| Object | Dump location |
|--------|----------------|
| Card cache `do_payment_status` / `customer_payment_status` / `customer_settlement_kind` | `bodyshop_repair_cards` ~20660 |
| `public.bodyshop_settlement_lines` | CREATE TABLE ~20770 |
| `public.bodyshop_settlements` | CREATE TABLE ~20822 |
| `add_bodyshop_settlement_line` (`row_security=off`, paise rounding) | ~1318 |
| `_bodyshop_settlement_actor` (JWT email) | ~1211 |
| `bodyshop_settlement_lines_insert_internal` | ~37449 |

DBL-0026 objects and DBL-0029 write-path fix are both present. Row facts for 005071 still come from live production, not this schema-only dump.

### Finding 1 — Billing lived only on the repair card (pre-apply)

`public.bodyshop_repair_cards` (pre-apply metadata; current dump ~20600):

| Column | Constraint / default | Role today |
|--------|----------------------|------------|
| `parts_entry_status` | `pending` / `entered` / `billed` | Stage 15/16 gate |
| `billed_amount` | `numeric(12,2)` nullable | Manual invoice amount |
| `do_status` | `pending` / `received` / `not_received` | Stage 16 |
| `do_amount` | `numeric(12,2)` nullable | Single DO total |
| `customer_diff_amount` | `numeric(12,2)` nullable | UI calc `billed − do` when DO received |
| `payment_status` | `pending` / `received` / `not_received` | Stage 15 “done” + stage 18 |
| `payment_slip_url` | text nullable | Unused on 005071 |

No `tds`, `ins_amount`, `gst_amount` (except `doc_gst` boolean), receipt, ledger, or settlement table existed **in the pre-apply dump**. That gap is closed; see the post-apply table above.

### Finding 2 — Invoice money already exists in DMS tables (not wired)

| Table | 005071 live row | Gap |
|-------|-----------------|-----|
| `psf_revenue_dms` id 66076 | Invoice `IMBTAI2627006673` 23 Aug · ₹1,71,793.30 · labour 29,854 · parts 1,41,939.30 · `tax_parts` 21,651.76 · CREDIT · IRN Active · account **GO DIGIT GENERAL INSURANCE LIMITED C/O PADAM CHAND REGAR** | Not used by Billing tab |
| `job_card_closed_data` id 996503 | Same totals · closed 23 Aug | Not used by Billing tab |
| `service_invoice_order_data` id 531508 | Closed · CREDIT · `balance_payment_to_be_adjusted` = 1,71,793 · `total_payment_amount_adjusted` = 0 | Proves DMS unpaid |
| `service_invoice_data` | No row for this VRN/SR | Do not depend on it |
| `audit_logs` | One row (claim intimation only) | Billing overwrites have no trail |

### Finding 3 — Stage / save contract (web)

[src/pages/BodyshopRepairPage.tsx](src/pages/BodyshopRepairPage.tsx) Billing save (~2130):

- Requires `do_amount` when `do_status = received`.
- Sets `customer_diff_amount = billed − do`.
- If `payment_status = received`, jumps `current_stage` to 17 (Delivery).

Stage worklist (~3618):

- Stage 15 done = billed + DO received + payment received.
- Stage 16 done = DO received.
- Stage 18 active when pointer is 17+.

BODYSHOP-QUEUE-001 projection trigger does **not** watch billing columns. Stages 13–18 stay frontend-computed. This plan keeps that split; it only changes the predicates and the source of `payment_status`.

### Finding 4 — Mobile already drifts from DB

[mobile/src/app/(tabs)/bodyshop-repair.tsx](mobile/src/app/(tabs)/bodyshop-repair.tsx):

- Parts chips: `pending` / `done` (DB allows `pending` / `entered` / `billed`).
- DO chips: `pending` / `raised` / `approved` / `rejected` (DB allows `pending` / `received` / `not_received`).
- Payment chips: `pending` / `partial` / `paid` (`partial` / `paid` fail the card CHECK).
- Customer diff is editable (web is calculated).

Mobile v1 must follow the web ledger contract. Do not keep a second status vocabulary.

### Finding 5 — 005071 proves the accounts break

| Source | Amount | Payment truth |
|--------|--------|---------------|
| DMS invoice | ₹1,71,793.30 | Outstanding ₹1,71,793 · receipts ₹0 |
| Card billed | ₹1,71,793.00 | 30 paise dropped |
| Card DO | ₹1,42,995.00 | Status Received — no INS/TDS/GST |
| Card customer diff | ₹28,798.00 | Status Payment Received — no receipt |
| Policy company | United India `0209003124P113314149` | Invoice billed to Go Digit |

July dump (`local_folder/backups/chunks/`) still has this card at Survey with null billing. Do not use the dump for current amounts.

---

## Locked Business Rules (v1)

### Recommendation (Stage 18)

Do **not** keep a single Payment Status. Do **not** add typed `main_amount` / `gst_amount` / `tds_amount` / `customer_paid` columns on the card (those still overwrite and lose history).

Stage 18 is two derived statuses plus an append-only ledger:

| Surface | What the user enters | What the system derives |
|---------|----------------------|-------------------------|
| **DO Payment** | Main, GST, TDS posted separately or together; optional Reference / Remark | `insurance_due = do_amount − (Main + GST + TDS)` and **DO Payment Status**. Who/when = `actor_email` + `created_at`; note = `reference` / `remarks` |
| **Customer Diff Payment** | Amount received **or** amount refunded; optional Reference / Remark | Remaining due / remaining refund and **Customer Diff Payment Status** |

`do_status = received` on stage 16 only means the DO amount was captured. It is **not** DO Payment Status.

### Sign convention (do not invert)

Keep the live Billing formula already on 005071:

```
customer_diff = invoice_amount − do_amount
```

| `customer_diff` | Stage 18 label | User posts | Remaining |
|-----------------|----------------|------------|-----------|
| `> 0` | Recoverable from customer | Customer receipt (they paid X) | `diff − receipts` = still due |
| `< 0` | Customer Refund | Customer refund (we refunded X) | `|diff| − refunds` = still to refund |
| `= 0` | Settled | Nothing | ₹0 |

**005071 lock:** +₹28,798.30 is **Recoverable from customer**, not a refund. A verbal “positive = refund” reading is rejected because it would invert the production field and this case.

Invoice GST (`tax_parts` ₹21,651.76 on 005071) is display-only. It is **not** the DO GST line.

### Identity

| Rule | Value |
|------|-------|
| One settlement header | Per `bodyshop_repair_cards.id` (unique). |
| Invoice source | Prefer latest `psf_revenue_dms` (`invoice_status` not Cancelled). Manual override with reason. |
| Billed amount | Equals `invoice_amount`. |
| DO amount | Approved insurance share. Capturing DO ≠ insurance paid. |
| Customer diff | `invoice_amount − do_amount` (signed). |

### Ledger math

```
customer_diff         = invoice_amount − do_amount
customer_kind         = due if diff > 0; refund if diff < 0; none if diff = 0
do_released           = Main + GST + TDS (not reversed)
insurance_due         = do_amount − do_released
customer_posted       = receipts if kind=due; refunds if kind=refund
customer_remaining    = |customer_diff| − customer_posted
outstanding           = insurance_due + customer_remaining
```

Main is the insurer cash/NEFT. GST and TDS still reduce insurance due (they are part of the DO release, not extra cash).

### Two derived payment statuses

Same vocabulary on both sides: `pending` / `partial` / `received` / `not_received`.

**DO Payment Status**

| Condition | Status |
|-----------|--------|
| No `do_amount` | `pending` |
| `insurance_due = do_amount` (nothing posted) | `pending` |
| `0 < insurance_due < do_amount` | `partial` |
| `insurance_due = 0` | `received` |
| Accounts marks DO not receivable | `not_received` |

**Customer Diff Payment Status**

| Condition | Status |
|-----------|--------|
| `customer_kind = none` | `received` (nothing to collect or refund) |
| Nothing posted and `|diff| > 0` | `pending` |
| `0 < remaining < \|diff\|` | `partial` |
| `remaining = 0` | `received` (due collected **or** refund completed) |
| Accounts marks customer side not receivable | `not_received` |

**Overall card `payment_status`** (cache only; Stage 18 done gate):

| Condition | Overall |
|-----------|---------|
| Either component missing / both pending, no lines | `pending` |
| Any component `partial`, or one received and the other not | `partial` |
| Both components `received` | `received` |
| Either component `not_received` and the other received | `partial` until Accounts closes the other; if both `not_received` then `not_received` |

UI never sets these dropdowns. Card CHECK must add `partial`. Add derived cache columns `do_payment_status` and `customer_payment_status` (same CHECK). Add `customer_settlement_kind` `due` / `refund` / `none`.

### Status is AUTO — not a manual dropdown

**Recommendation:** do not let the user click Pending → Received. That is how 005071 is already wrong (Payment Status = Received with ₹0 posted).

The user never writes status. They only post money. The trigger/RPC recomputes status after every line.

| Default | What the user does | Status becomes |
|---------|--------------------|----------------|
| Both sides start `pending` once DO / customer diff exist | Nothing posted | stay `pending` |
| User posts some Main/GST/TDS, or some customer X | Amounts saved as ledger lines | `partial` if remaining > 0 |
| User posts enough that remaining = 0 | Last line closes the bucket | `received` automatically |
| User reverses a line | New reversal line | drops back to `partial` or `pending` |

**Rejected flow:** “Change status to Received, then fill Main/GST/TDS.” Status would flip before money exists — same hole as today.

**Rejected flow:** “Click Received and type one received amount with no Main/GST/TDS split.” Accounts cannot see insurance due.

**Allowed shortcut (still auto):** a button **Post remaining as received**. It does **not** write status. It opens the amount form with remaining pre-filled:

- DO: remaining insurance due must be split into Main / GST / TDS (at least one > 0, sum = remaining). No Date field. Optional **Reference / Remark** (UTR, cheque, or note) is stored on each line. Trail also includes `created_at` + `actor_email`.
- Customer due: remaining recoverable pre-filled as the receipt.
- Customer refund: remaining refund pre-filled.

On save, lines are inserted; status flips to `received` only because remaining hit zero.

**Only manual exception:** Accounts RPC `mark_bodyshop_settlement_not_received(party, reason)` sets that side to `not_received`. Not on the SA Billing dropdown.

### Stage 18 UI (amounts first)

Status pills are read-only.

1. **DO Payment** — while not `received`: Main ₹, GST ₹, TDS ₹ (any subset), optional Reference / Remark. Read-only: Insurance due, status pill. When `received`, hide amount inputs. No Date field.
2. **Customer Diff Payment** — while not `received`: Amount received (or Amount refunded), optional Reference / Remark. Read-only: Remaining, status pill, kind badge. When `received`, hide amount inputs.

No Payment Status `<select>`.

### Stage predicates

| Stage | Where | Active | Done |
|-------|-------|--------|------|
| 15 Billing | Billing tab | Invoice / billed started | parts billed + invoice amount |
| 16 DO Status | Billing tab | Stage 15 done | `do_status = received` + `do_amount` |
| 18 Payment | Stage 18 + Billing payment panels | Stage 16 done or any payment line | **both** DO and Customer Diff payment statuses = `received` |

Overall Payment Received must **not** auto-advance Delivery.

### Lines (append-only)

| Field | Allowed values |
|-------|----------------|
| `party` | `insurance` / `customer` |
| `line_type` | `do_component` / `receipt` / `refund` / `waiver` / `reversal` |
| `component` | `MAIN` / `GST` / `TDS` / `CUSTOMER` / `CUSTOMER_REFUND` / `WAIVER` |
| DO lines | `party=insurance`, `line_type=do_component`, component MAIN/GST/TDS |
| Customer receipt | `party=customer`, `line_type=receipt`, component CUSTOMER (only when kind=due) |
| Customer refund | `party=customer`, `line_type=refund`, component CUSTOMER_REFUND (only when kind=refund) |
| Reverse | New `reversal` line. Never UPDATE/DELETE a posted line. |

Required: `amount > 0`, actor (`actor_id` / `actor_email`), `created_at`. `txn_date` defaults to current date in the RPC. No UI Date field. Optional `reference` / `remarks` (one **Reference / Remark** input; shown on Posted entries).

A single Stage 18 save may post up to three DO lines (Main / GST / TDS) in one RPC call, each as its own immutable row.

### Over-posting

- `Main + GST + TDS` cannot exceed `do_amount` (v1 reject).
- Customer receipts cannot exceed positive `customer_diff`.
- Customer refunds cannot exceed `|customer_diff|` when negative.
- Receipts are rejected when kind=refund; refunds are rejected when kind=due.

### Payer warning (operational, not a hard block)

If `bodyshop_repair_cards.insurance_company` does not fuzzy-match `psf_revenue_dms.account`, show a warning. 005071: United India vs Go Digit.

---

## Scope

### In scope (v1)

- [x] DBL-0026 migration + paired `sql_checks`
- [x] Tables `bodyshop_settlements`, `bodyshop_settlement_lines`
- [x] RPCs to upsert header, post line, reverse line, read settlement
- [x] Trigger: reject line UPDATE/DELETE; sync card cache after header/line change
- [x] Backfill headers from existing card billed/DO (no fake INS/TDS/GST/receipts)
- [x] Web Billing tab redesign on `/bodyshop-repair`
- [x] Accounts pending strip (insurance pending + customer recoverable) on the same page
- [x] Mobile Billing tab aligned to the same RPCs
- [x] Widen `payment_status` CHECK with `partial`; add card cache `do_payment_status`, `customer_payment_status`, `customer_settlement_kind`
- [x] Stage 18 two-panel UI (DO Payment + Customer Diff Payment)
- [ ] Evidence test matrix + 005071 golden-case replay

### Out of scope (v1)

- Separate `/accounts` module or new RBAC module (reuse `bodyshop_repair` view/modify)
- Multi-invoice per JC
- Auto-import DMS `total_payment_amount_adjusted` as receipts (DMS is ₹0 on 005071; map later)
- Changing BODYSHOP-QUEUE-001 projection trigger set (keep 15–18 frontend)
- BODYSHOP-FLOW presentational redesign
- Earnings / tracker changes
- Writing off ageing via bulk import

---

## Database changes (DBL-0026)

Do **not** add `main_amount`, `gst_amount`, `tds_amount`, or `customer_paid` on `bodyshop_repair_cards`. Those would be overwrite scalars again. Money lives only on settlement lines. Status on the card is a **cache** written by trigger after lines change — the card is not the place the user edits status.

### A. Alter existing `public.bodyshop_repair_cards`

| Change | Why |
|--------|-----|
| Drop/replace `bodyshop_repair_cards_payment_status_check` to allow `partial` | Overall cache: pending / partial / received / not_received |
| Add `do_payment_status text` same CHECK, default `pending` | Stage 18 DO pill / filters |
| Add `customer_payment_status text` same CHECK, default `pending` | Stage 18 customer pill / filters |
| Add `customer_settlement_kind text` CHECK (`due` / `refund` / `none`), nullable | Label: recoverable vs refund vs settled |

Keep `billed_amount`, `do_amount`, `do_status`, `customer_diff_amount` as they are. Trigger keeps them in sync with the header. App Billing save must stop writing `payment_status`.

### B. New `public.bodyshop_settlements` (1 row per repair card)

Header / derived totals. Unique `(repair_card_id)`. FK cascade to the card. Columns as in the table below. `do_payment_status`, `customer_payment_status`, and `derived_payment_status` are maintained by function — not updated by the client.

### C. New `public.bodyshop_settlement_lines` (append-only)

One row per Main, GST, TDS, customer receipt, customer refund, or reversal. No `updated_at`. BEFORE UPDATE/DELETE trigger raises. Writes only via RPC.

### D. New functions / RPCs

| Object | Role |
|--------|------|
| `recalc_bodyshop_settlement(p_settlement_id)` | Internal: recompute released, dues, both statuses, overall; copy cache onto the card |
| `upsert_bodyshop_settlement_header(...)` | Invoice + DO capture (stages 15–16). Does not take payment_status. |
| `add_bodyshop_settlement_line(...)` | Post one line, or a Main+GST+TDS batch. Then recalc. |
| `reverse_bodyshop_settlement_line(...)` | Insert reversal, recalc. |
| `mark_bodyshop_settlement_not_received(...)` | Accounts-only manual exception. |
| `get_bodyshop_settlement(...)` | Read header + lines + suggested DMS invoice. |

### E. RLS + indexes

- RLS on both new tables, scoped like the card (`bodyshop_repair` view/modify + dealer).
- Lines: SELECT for view; INSERT/UPDATE/DELETE denied to `authenticated` (RPC is SECURITY DEFINER).
- Indexes: `repair_card_id`, `job_card_no`, `do_payment_status`, `customer_payment_status`, `insurance_due_amount`, `customer_remaining_amount` (pending lists).

### F. Backfill (data)

Create a header for every card that already has `billed_amount` or `do_amount`. Attach DMS invoice when the JC matches. **Do not** invent Main/GST/TDS or customer lines. If old `payment_status = received` and there are no lines, set `needs_accounts_review = true` and derived statuses to `pending`.

### Proposed Schema (lock before SQL)

### `public.bodyshop_settlements`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint identity PK | |
| `repair_card_id` | integer UNIQUE NOT NULL | FK `bodyshop_repair_cards(id)` ON DELETE CASCADE |
| `job_card_no` | text NOT NULL | Denormalized for Accounts lists |
| `invoice_number` | text | e.g. IMBTAI2627006673 |
| `invoice_date` | date | |
| `invoice_amount` | numeric(14,2) | Source of billed |
| `invoice_labour_amount` | numeric(14,2) | Display |
| `invoice_spares_amount` | numeric(14,2) | Display |
| `invoice_account` | text | DMS bill-to |
| `do_amount` | numeric(14,2) | Approved DO |
| `do_status` | text | Mirror card CHECK |
| `do_reference` | text | Insurer DO no |
| `customer_diff_amount` | numeric(14,2) | Signed `invoice − DO` |
| `customer_settlement_kind` | text | `due` / `refund` / `none` |
| `do_released_amount` | numeric(14,2) NOT NULL DEFAULT 0 | Main+GST+TDS |
| `insurance_due_amount` | numeric(14,2) | `do_amount − do_released` |
| `customer_posted_amount` | numeric(14,2) NOT NULL DEFAULT 0 | Receipts or refunds |
| `customer_remaining_amount` | numeric(14,2) | `\|diff\| − posted` |
| `outstanding_amount` | numeric(14,2) | insurance due + customer remaining |
| `do_payment_status` | text | pending / partial / received / not_received |
| `customer_payment_status` | text | same vocabulary |
| `derived_payment_status` | text | overall AND of the two |
| `invoice_source` | text | `psf_revenue_dms` / `manual` |
| `needs_accounts_review` | boolean DEFAULT false | Set on backfill when card said received but no lines |
| `created_at` / `updated_at` / `created_by` / `updated_by` | timestamptz / text | |

### `public.bodyshop_settlement_lines`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint identity PK | |
| `settlement_id` | bigint NOT NULL | FK CASCADE |
| `repair_card_id` | integer NOT NULL | |
| `party` | text NOT NULL | |
| `line_type` | text NOT NULL | |
| `component` | text NOT NULL | |
| `amount` | numeric(14,2) NOT NULL CHECK > 0 | |
| `txn_date` | date NOT NULL | |
| `reference` | text | UTR / cheque / DO |
| `remarks` | text | |
| `reverses_line_id` | bigint | Self-FK |
| `is_reversed` | boolean DEFAULT false | Set when a reversal posts |
| `actor_id` | uuid | auth.uid() |
| `actor_email` | text | |
| `created_at` | timestamptz DEFAULT now() | No `updated_at` |

### RPCs (SECURITY DEFINER, `authenticated` EXECUTE)

| RPC | Writes |
|-----|--------|
| `upsert_bodyshop_settlement_header(...)` | Header + card cache (`billed_amount`, `do_*`, `customer_diff_amount`) |
| `add_bodyshop_settlement_line(...)` | Insert one line (or Main+GST+TDS batch), recalc both statuses |
| `reverse_bodyshop_settlement_line(p_line_id, p_reason)` | Insert reversal |
| `get_bodyshop_settlement(p_repair_card_id)` | Header + lines + DMS invoice suggestion |

Auth inside RPC: `is_admin()` OR (`has_module_modify('bodyshop_repair')` AND dealer scope via the linked card). SELECT via `bodyshop_repair` / `bodyshop_tracker` view.

RLS: enable on both tables; copy the card’s dealer-scope pattern through `repair_card_id`. Direct table INSERT on lines is denied; writes go through RPCs.

### Card cache sync (mandatory)

After every header/line change, write:

- `billed_amount` ← `invoice_amount`
- `do_amount` / `do_status` ← header
- `customer_diff_amount` ← signed `customer_diff_amount`
- `do_payment_status` / `customer_payment_status` / `customer_settlement_kind` ← header
- `payment_status` ← overall `derived_payment_status`

Existing list/queue queries keep working.

---

## Implementation Tasks

### Phase 0: Contract freeze

- [ ] **Task 0.1:** Accounts + Bodyshop Ops sign: Main+GST+TDS count against DO; customer_diff sign lock (positive = recoverable).
- [ ] **Task 0.2:** Confirm 005071 DO is ₹1,42,995 (not ₹1,42,992) and invoice payer (Go Digit vs United India).
- [x] **Task 0.3:** Publish test matrix (this plan’s evidence file).
- [x] **Task 0.4:** Product sign-off: overall Payment Received no longer auto-advances Delivery.
- [x] **Task 0.5:** Lock Stage 18 as two payment statuses (DO + Customer Diff), not one dropdown.
- [x] **Task 0.6:** Lock status as auto from posted amounts. No manual Pending → Received. Optional “Post remaining as received” still creates lines.

**Output:** `docs/Implementation_plans/webversion/categories/bodyshop/evidence/BODYSHOP-SETTLEMENT-001_TEST_MATRIX.md`

### Phase 1: Database and security (DBL-0026)

- [x] **Task 1.1:** Author `supabase/migrations/20260904120000_bodyshop_settlement_ledger.sql` (tables, CHECKs, indexes, RLS, RPCs, line immutability trigger, card-cache trigger).
- [x] **Task 1.2:** Author paired `supabase/sql_checks/20260904120000_bodyshop_settlement_ledger_checks.sql` (`Execution: This file can be run in one go.`).
- [x] **Task 1.3:** Widen `payment_status` CHECK with `partial`; add `do_payment_status`, `customer_payment_status`, `customer_settlement_kind` on the card.
- [x] **Task 1.4:** Reviewer APPROVED on DBL-0026; operator apply; VERIFIED; promote per `DB_CHANGE_PROTOCOL.md`.
- [x] **Task 1.5:** `npm run db:backup:metadata` after apply.

### Phase 2: Backfill

- [x] **Task 2.1:** For every card with `billed_amount` or `do_amount`, insert a header.
- [x] **Task 2.2:** Attach `psf_revenue_dms` invoice when JC matches (case-insensitive). Prefer DMS `total_invoice_amount` over rounded card billed.
- [x] **Task 2.3:** Set `needs_accounts_review = true` when card `payment_status = received` and no lines exist.
- [x] **Task 2.4:** Recompute derived status (005071 must become `pending` or review-flagged, not `received`).
- [x] **Task 2.5:** Record backfill counts in evidence.

### Phase 3: API

- [x] **Task 3.1:** `src/lib/api/bodyshopSettlement.ts` — types + RPC wrappers.
- [x] **Task 3.2:** Suggest invoice from `psf_revenue_dms` when header is empty.
- [x] **Task 3.3:** Stop Billing tab from writing `payment_status` / `customer_diff_amount` through `updateRepairCard`.
- [x] **Task 3.4:** Shared derive helpers for UI display (pure; DB remains source of truth).

### Phase 4: Web Billing tab

- [x] **Task 4.1:** Invoice block: number, date, amount. DMS invoice row = DMS number + DMS `account` (bill-to) + “Use DMS invoice”. Policy company stays on the card; mismatch banner if they differ.
- [x] **Task 4.2:** DO block: status, amount, reference. Customer due read-only.
- [x] **Task 4.3:** Stage 18 **DO Payment** panel: Main / GST / TDS (any subset). Hide inputs when received. Who/when from `actor_email` + `created_at`. Optional Reference / Remark on post. No Date field.
- [x] **Task 4.4:** Stage 18 **Customer Diff Payment** panel: receipt or refund by kind. Show remaining due/refund + Customer Diff Payment Status pill.
- [x] **Task 4.5:** Event table (newest first) with reverse action and Reference / Remark column.
- [x] **Task 4.6:** Summary: Invoice / DO / Main+GST/TDS / Insurance due / Customer diff / Posted / Remaining / Outstanding.
- [x] **Task 4.7:** Remove the single Payment Status dropdown. Overview stage 18 shows the two pills.
- [x] **Task 4.8:** Payer-mismatch warning. `needs_accounts_review` banner.
- [x] **Task 4.9:** Update stage 15/16/18 predicates (stage 18 done = both statuses received).

### Phase 5: Accounts pending strip + mobile

- [x] **Task 5.1:** Pending strip: insurance due (DO Payment ≠ received) and customer remaining (due or refund).
- [x] **Task 5.2:** Mobile Billing: same header/line RPCs; drop illegal chips; customer due read-only.
- [ ] **Task 5.3:** Keep `payment_slip_url` optional attach on a receipt line (reuse existing upload if already wired; else defer URL to remarks/reference).

### Phase 6: Validation + sign-off

- [ ] **Task 6.1:** Execute test matrix on staging, then 005071 on production after apply.
- [ ] **Task 6.2:** Confirm DMS outstanding still matches ledger outstanding until lines are posted.
- [x] **Task 6.3:** `tsc --noEmit` / build clean; no new lints on touched files.
- [ ] **Task 6.4:** Accounts + Bodyshop Ops + Engineering sign-off.

### Phase 7: Deferred

- [ ] **Task 7.1:** Dedicated `/accounts` queue + export.
- [ ] **Task 7.2:** Multi-invoice per JC.
- [ ] **Task 7.3:** Map future DMS payment adjustments to receipt lines.
- [ ] **Task 7.4:** Watch billing columns in BODYSHOP-QUEUE-001 projection (optional).

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
⏳ 0.1 | Accounts + Ops sign Main/GST/TDS + sign lock | Accounts + Bodyshop Ops | - | - | Positive diff = recoverable
⏳ 0.2 | Confirm 005071 DO + insurer payer | Accounts | - | - | Live DO 142995; invoice account Go Digit
✅ 0.3 | Publish test matrix | Engineering | 2026-09-04 | 2026-09-04 | BODYSHOP-SETTLEMENT-001_TEST_MATRIX.md
✅ 0.4 | Delivery no longer auto-advances on payment | Product + Eng | 2026-09-04 | 2026-09-04 | Billing save no longer jumps to stage 17
✅ 0.5 | Lock Stage 18 dual payment statuses | Product + Eng | 2026-09-04 | 2026-09-04 | DO + Customer Diff panels
✅ 0.6 | Lock status auto from amounts (no dropdown) | Product + Eng | 2026-09-04 | 2026-09-04 | Post remaining = lines, not status write
```

### Phase 1

```text
✅ 1.1 | Author settlement ledger migration | Platform | 2026-09-04 | 2026-09-04 | 20260904120000_bodyshop_settlement_ledger.sql
✅ 1.2 | Author paired sql_checks | Platform | 2026-09-04 | 2026-09-04 | sql_checks passed
✅ 1.3 | Widen payment_status + add two status cache columns | Platform | 2026-09-04 | 2026-09-04 | CHECK includes partial
✅ 1.4 | Apply + verify DBL-0026 | Operator + Reviewer | 2026-09-04 | 2026-09-04 | APPLIED prod; 299 headers
✅ 1.5 | Refresh full_metadata.sql | Platform | 2026-09-04 | 2026-09-04 | dump 13:05 IST; sha256=07431175…; DBL-0026+0029 in dump
```

### Phase 2

```text
✅ 2.1 | Backfill headers from card scalars | Platform | 2026-09-04 | 2026-09-04 | 299 headers
✅ 2.2 | Attach DMS invoices | Platform | 2026-09-04 | 2026-09-04 | JC match in backfill
✅ 2.3 | Flag received-without-lines for review | Platform | 2026-09-04 | 2026-09-04 | 005071 needs_accounts_review
✅ 2.4 | Recompute derived payment_status | Platform | 2026-09-04 | 2026-09-04 | 005071 pending/pending
✅ 2.5 | Record backfill counts | Platform | 2026-09-04 | 2026-09-04 | 299 headers; 0 lines on 005071
```

### Phase 3

```text
✅ 3.1 | bodyshopSettlement.ts API | Web | 2026-09-04 | 2026-09-04 | RPC wrappers
✅ 3.2 | DMS invoice suggestion | Web | 2026-09-04 | 2026-09-04 | Use DMS invoice
✅ 3.3 | Stop Billing overwrite of payment_status | Web | 2026-09-04 | 2026-09-04 | stripped from updateRepairCard
✅ 3.4 | Shared display helpers | Web | 2026-09-04 | 2026-09-04 | stage 15/16/18 helpers
```

### Phase 4

```text
✅ 4.1 | Invoice block | Web | 2026-09-04 | 2026-09-04 | BodyshopSettlementPanel
✅ 4.2 | DO + customer due | Web | 2026-09-04 | 2026-09-04 | read-only diff
✅ 4.3 | Stage 18 DO Payment panel (Main/GST/TDS) | Web | 2026-09-04 | 2026-09-04 | hide form when received; optional Reference/Remark
✅ 4.4 | Stage 18 Customer Diff panel (due/refund) | Web | 2026-09-04 | 2026-09-04 | auto status pill; optional Reference/Remark
✅ 4.5 | Event table + reverse | Web | 2026-09-04 | 2026-09-04 | newest first; Reference/Remark column
✅ 4.6 | Settlement summary | Web | 2026-09-04 | 2026-09-04 | 8 totals
✅ 4.7 | Remove single payment dropdown; two pills | Web | 2026-09-04 | 2026-09-04 | overview + billing
✅ 4.8 | Payer warning + review banner | Web | 2026-09-04 | 2026-09-04 | 005071 Go Digit vs United India
✅ 4.9 | Stage 18 done = both statuses received | Web | 2026-09-04 | 2026-09-04 | no delivery auto-advance
```

### Phase 5

```text
✅ 5.1 | Accounts pending strip | Web | 2026-09-04 | 2026-09-04 | Insurance due + Customer remaining
✅ 5.2 | Mobile Billing parity | Mobile | 2026-09-04 | 2026-09-04 | same RPCs; legal chips
⏳ 5.3 | Optional payment slip on receipt | Web | - | - | Deferred to remarks/reference
```

### Phase 6

```text
⏳ 6.1 | Test matrix + 005071 replay | Accounts + Eng | - | - | Pending live UI smoke
⏳ 6.2 | DMS vs ledger outstanding | Accounts | - | - | Pending
✅ 6.3 | Typecheck + lint | Engineering | 2026-09-04 | 2026-09-04 | tsc -b clean
⏳ 6.4 | Sign-off | Accounts + Ops + Eng | - | - | Pending
```

---

## File Change List

| File | Action |
|------|--------|
| `supabase/migrations/20260904120000_bodyshop_settlement_ledger.sql` | **Add** (Phase 1) |
| `supabase/sql_checks/20260904120000_bodyshop_settlement_ledger_checks.sql` | **Add** (Phase 1) |
| `supabase/migrations/20260904150000_bodyshop_settlement_post_do_rpc_fix.sql` | **Add** (DBL-0029 post-DO 400) |
| `supabase/sql_checks/20260904150000_bodyshop_settlement_post_do_rpc_fix_checks.sql` | **Add** |
| `docs/shared/reference/DB_CHANGE_LEDGER.md` | **Modify** DBL-0026 VERIFIED; DBL-0029 APPLIED |
| `supabase/backups/full_metadata.sql` | **Refresh** 2026-09-04 13:05 IST |
| `supabase/evidence/authoritative_metadata_manifest.json` | **Refresh** sha256 `07431175…` |
| `src/lib/api/bodyshopSettlement.ts` | **Add** |
| `src/components/BodyshopSettlementPanel.tsx` | **Add** |
| `src/lib/api/bodyshopRepair.ts` | **Modify** (types; stop billing overwrite) |
| `src/pages/BodyshopRepairPage.tsx` | **Modify** Billing tab + stage predicates |
| `src/App.css` | **Modify** settlement panel / accounts pills |
| `mobile/src/app/(tabs)/bodyshop-repair.tsx` | **Modify** Billing tab |
| `mobile/src/lib/api/bodyshopSettlement.ts` | **Add** |
| `mobile/src/components/BodyshopSettlementBilling.tsx` | **Add** |
| `docs/.../evidence/BODYSHOP-SETTLEMENT-001_TEST_MATRIX.md` | **Add** |
| `docs/Implementation_plans/webversion/INDEX.md` | **Modify** registry |
| `docs/Implementation_plans/webversion/IMPLEMENTATION_TRACKER.md` | **Modify** row |
| BODYSHOP-QUEUE-001 projection SQL | No change (v1) |
| `Bodyshop-Flow.md` | No change (presentational-only) |

---

## Dependencies & Prerequisites

- [x] Schema audit against `full_metadata.sql` (pre-apply 2026-09-04; post-apply dump 13:05 IST).
- [x] Live 005071 financial trail (invoice, DO, DMS outstanding).
- [ ] Accounts sign-off on Main+GST+TDS against DO, and positive customer_diff = recoverable.
- [x] DBL-0026 apply window (no overlap with other `bodyshop_repair_cards` CHECK changes).
- [ ] Staging `/bodyshop-repair` with at least one billed Accident JC.
- [ ] No new RBAC module. Writes require existing `bodyshop_repair` modify.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Cards already marked Payment Received hide real dues | High | High | Backfill `needs_accounts_review`; 005071 must leave Received |
| Over-post Main+GST+TDS vs DO | Medium | High | RPC reject; Accounts waiver only in Phase 7 |
| Sign of customer_diff inverted in UI copy | Medium | High | Lock to invoice−DO; 005071 +28798 = recoverable |
| Stage 15/16/18 queues shift after predicate change | Medium | Medium | Keep card cache; test matrix R1–R5 |
| Mobile illegal statuses already in local drafts | Medium | Medium | RPC validates; align chips before prod |
| Invoice payer ≠ policy company | High on 005071 | High | Warning banner; do not auto-apply DO to wrong insurer |
| Projection trigger ignores billing | Low | Low | Frontend 13–18 already owns this; document |

---

## Success Criteria

- ✅ Stage 18 shows **two** statuses. 005071: DO Payment `pending`, Customer Diff `pending` (Recoverable from customer ₹28,798.30). Single Payment Received is gone.
- ✅ Posting Main+GST+TDS that sum to ₹1,42,995 sets DO Payment `received` and insurance due ₹0; Customer Diff stays `pending` until receipts.
- ✅ Customer pays ₹10,000 → remaining recoverable ₹18,798.30, Customer Diff `partial`, overall `partial`.
- ✅ Negative customer_diff case shows **Customer Refund** and accepts refund lines only.
- ✅ Stage 18 completes only when **both** statuses are `received`. Delivery does not auto-flip.
- ✅ Posted lines cannot be edited or deleted; reverse creates a new line.
- ✅ Card cache includes both component statuses plus overall `payment_status`.
- ✅ sql_checks + metadata refresh complete; DBL-0026 VERIFIED in `full_metadata.sql` (2026-09-04 13:05 IST). DBL-0029 APPLIED (same dump).

---

## Communication & Sign-Off

**Stakeholders:**

- [ ] Product Owner: _______________ (Date)
- [ ] Bodyshop Operations Lead: _______________ (Date)
- [ ] Accounts Lead: _______________ (Date)
- [ ] Web Engineering Lead: _______________ (Date)
- [ ] Platform / DB Operator: _______________ (Date)

---

## Notes & Lessons Learned

### 2026-09-04 — Kickoff / investigation

- Live card 630 is Stage 18 Payment, Active, delivery pending. Billing last written 2026-09-02 21:46 IST.
- Only immutable admin event for the card is `audit_logs` claim intimation (id 384).
- Recommendation rejected extra overwrite columns (`ins_amount`, `tds_amount`, `customer_paid`) because they still lose partials and actors.
- July chunk dump is stale for this JC (Survey, null billing). Use live rows for money; metadata dump for schema.

### 2026-09-04 — Stage 18 dual payment-status lock

- Product ask: Stage 18 Payment Status must be two components (DO amount + Customer Diff), with Main/GST/TDS on DO and X paid on customer.
- Locked sign: `customer_diff = invoice − DO`. Positive = Recoverable from customer. Negative = Customer Refund. 005071 (+28,798) stays recoverable.
- INS renamed to **Main** to match Accounts language. Component enum: `MAIN` / `GST` / `TDS`.
- Overall `payment_status` is AND of the two derived statuses. Stage 18 done only when both are `received`.
- Status is auto. User posts amounts; they do not click Received first. “Post remaining as received” is a prefill shortcut that still inserts lines.
- When a side is `received`, amount inputs hide. No Date field. Optional **Reference / Remark** is saved on the line (`reference` + `remarks`) and shown in Posted entries. Trail also includes `actor_email` + `created_at`. Main / GST / TDS may be posted in any combination, together or later.
