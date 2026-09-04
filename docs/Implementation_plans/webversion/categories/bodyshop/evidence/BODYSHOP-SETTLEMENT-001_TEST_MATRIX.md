# BODYSHOP-SETTLEMENT-001 — Manual Test Matrix

**Plan:** `BODYSHOP-SETTLEMENT-001_PAYMENT_RECONCILIATION_LEDGER_PLAN_2026-09-04.md`  
**Created:** 2026-09-04  
**Updated:** 2026-09-04 (Stage 18 dual payment-status lock)  
**Purpose:** Staging/production QA before Accounts sign-off.  
**Golden case:** `JC-MBTPLT-JP1-2627-005071` / `RJ52UA9900` / invoice `IMBTAI2627006673`.

---

## Preconditions

- [ ] DBL-0026 applied and sql_checks passed
- [ ] Stage 18 shows **two** payment panels (no single Payment Status dropdown)
- [ ] Tester has `bodyshop_repair` modify
- [ ] 005071 (or a staging clone) is available

---

## Formula reference

```
customer_diff      = invoice_amount − do_amount
customer_kind      = due if diff > 0; refund if diff < 0; none if diff = 0
do_released        = Main + GST + TDS (not reversed)
insurance_due      = do_amount − do_released
customer_posted    = receipts if kind=due; refunds if kind=refund
customer_remaining = |customer_diff| − customer_posted
outstanding        = insurance_due + customer_remaining
```

Sign lock: **positive customer_diff = Recoverable from customer**. Negative = Customer Refund.  
Invoice `tax_parts` is **not** the DO GST line.

---

## Golden case — JC-MBTPLT-JP1-2627-005071

Opening after backfill (no Main/GST/TDS/receipt lines):

| Component | Opening | Posted | Remaining | Derived status |
|-----------|---------|--------|-----------|----------------|
| Invoice | ₹1,71,793.30 | — | — | |
| DO Payment | ₹1,42,995.00 | ₹0 | Insurance due ₹1,42,995.00 | `pending` |
| Customer Diff (due) | ₹28,798.30 | ₹0 | Recoverable ₹28,798.30 | `pending` |
| Overall | | | | `pending` or review-flagged — **not** `received` |

| ID | Action | Expected | Pass |
|----|--------|----------|------|
| G1 | Open Stage 18 / Billing payment | Two panels. No single Payment Status dropdown. Kind = Recoverable from customer | [ ] |
| G2 | Payer warning | United India policy vs Go Digit invoice account visible | [ ] |
| G3 | Card cache | Both component statuses `pending`. Overall ≠ received. Diff +28798.30 | [ ] |
| G4 | Post customer receipt ₹10,000 | Customer remaining ₹18,798.30 · Customer Diff `partial` · DO Payment still `pending` · overall `partial` | [ ] |
| G5 | Post Main + GST + TDS = ₹1,42,995 | Insurance due ₹0 · DO Payment `received` · Customer Diff still `partial` · overall `partial` | [ ] |
| G6 | Post remaining customer ₹18,798.30 | Both statuses `received` · Stage 18 done · Delivery still pending | [ ] |
| G7 | Reverse the ₹10,000 receipt | New reversal · Customer Diff back to `partial` · original line `is_reversed` | [ ] |
| G8 | Authenticated UPDATE/DELETE a line | Rejected | [ ] |
| G9 | Post Main that would exceed DO | RPC error · balances unchanged | [ ] |
| G10 | Overview stage 18 row | Shows two pills (DO Payment + Customer Diff), not one | [ ] |
| G11 | Try to set DO Payment Status via UI dropdown | Control does not exist / save cannot write status | [ ] |
| G12 | Post remaining as received with Main+GST+TDS = remaining | Lines inserted · DO Payment becomes `received` only after save | [ ] |
| G13 | Click received with no amounts | Impossible — no status click. Empty post rejected | [ ] |

---

## Header / invoice / DO capture (stages 15–16)

| ID | Setup | Expected | Pass |
|----|-------|----------|------|
| H1 | Matching `psf_revenue_dms` | “Use DMS invoice” fills number, date, amount, labour, parts, account | [ ] |
| H2 | Manual invoice with reason | `invoice_source = manual` | [ ] |
| H3 | DO received, amount blank | Save blocked | [ ] |
| H4 | Invoice 100000, DO 100000 | Kind = Settled · Customer Diff status `received` · no customer form | [ ] |
| H5 | Invoice 100000, DO 110000 | Kind = Customer Refund · remaining refund ₹10,000 · receipt form hidden | [ ] |

---

## DO Payment (Main / GST / TDS)

| ID | Setup | Expected | Pass |
|----|-------|----------|------|
| I1 | Main only, less than DO | Insurance due = DO − Main · DO Payment `partial` | [ ] |
| I2 | Main + GST + TDS = DO | Insurance due ₹0 · DO Payment `received` |
| I2b | Main + TDS = DO, GST empty (005071: 140571 + 2424) | Allowed · two lines · GST not required | [ ] |
| I3 | GST line ≠ invoice `tax_parts` | Allowed · invoice GST stays display-only | [ ] |
| I4 | Missing UTR on Main | **Lock at Phase 0:** UTR required for Main; optional for GST/TDS | [ ] |
| I5 | Amount 0 or negative | Rejected | [ ] |
| I6 | `do_status = received` with no Main/GST/TDS | Stage 16 done · DO Payment still `pending` | [ ] |

---

## Customer Diff Payment (due vs refund)

| ID | Setup | Expected | Pass |
|----|-------|----------|------|
| C1 | Positive diff, first partial receipt | Customer Diff `partial` · remaining due decreases | [ ] |
| C2 | Receipts sum to positive diff | Customer Diff `received` | [ ] |
| C3 | Receipt > remaining due | Rejected | [ ] |
| C4 | Negative diff, post refund X | Remaining refund decreases · status `partial` until full | [ ] |
| C5 | Try receipt on a refund case | Rejected | [ ] |
| C6 | Try refund on a due case (005071) | Rejected | [ ] |
| C7 | Event table | Newest first · actor + timestamp · component label Main/GST/TDS/Customer | [ ] |

---

## Stage / queue regression

| ID | Check | Expected | Pass |
|----|-------|----------|------|
| R1 | Stage 15 done | Invoice + parts billed — not payment | [ ] |
| R2 | Stage 16 done | DO captured — insurance may still be due | [ ] |
| R3 | Stage 18 done | Only when **both** payment statuses are `received` | [ ] |
| R4 | Delivery | Separate action · neither status flips `delivery_status` | [ ] |
| R5 | Stages 1–14 | Unchanged | [ ] |
| R6 | One side received, other pending | Stage 18 stays active · overall `partial` | [ ] |

---

## Mobile

| ID | Check | Expected | Pass |
|----|-------|----------|------|
| M1 | No illegal chips persisted | No `paid` / `raised` / `approved` / `done` as billing values | [ ] |
| M2 | Two statuses | DO Payment + Customer Diff (due or refund) | [ ] |
| M3 | Post Main and a receipt | Same balances as web | [ ] |

---

## RBAC / security

| ID | Check | Expected | Pass |
|----|-------|----------|------|
| S1 | View-only `bodyshop_repair` | Read header/lines · cannot post | [ ] |
| S2 | Modify `bodyshop_repair` | Can upsert header + post/reverse | [ ] |
| S3 | Other dealer | Cannot see or post | [ ] |
| S4 | Direct `INSERT` into lines | Denied (RPC only) | [ ] |

---

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| Accounts | | | [ ] |
| Bodyshop Ops | | | [ ] |
| Engineering | | | [ ] |
