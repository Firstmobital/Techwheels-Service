# ACCOUNTS-001 Test Matrix

**Plan:** ACCOUNTS-001  
**Created:** 2026-09-11  
**Status:** Ready after DBL-0068 apply (2026-09-16)

## SQL Editor

1. Run `supabase/migrations/20260911130000_accounts_mechanical_bodyshop_desk.sql`
2. Run `supabase/sql_checks/20260911130000_accounts_mechanical_bodyshop_desk_checks.sql`
3. Expected: module `accounts` row; mechanical table exists; RPCs SECURITY DEFINER; Recovery still insurance-due only.

## Mechanical

- [ ] Floor Incharge type + Mark Done JC appears in Accounts → Mechanical
- [ ] Accident / Rusting never appear
- [ ] Capture invoice number, billed amount, notes; row updates
- [ ] Capture **Fetch from DMS** fills invoice number/date/billed when exactly one live DMS row exists; Save still required; Remaining unchanged
- [ ] 0 or 2+ DMS rows shows “No unique DMS invoice”; typing still works
- [ ] Fetch hidden after first receipt (invoice locked)
- [ ] Payment received date defaults to today IST; required before Post payment
- [ ] Posted line stores selected `payment_received_date` and an independent `posted_at`
- [ ] Receipts history shows Received Date from `payment_received_date`; older rows still render after IST backfill
- [ ] User without `accounts` gets AccessDenied at `/accounts`
- [ ] Cash / UPI / Card receipt on an invoice dated on/after 2-Sep-2026 gets `RApp/26-27/nnnn` (cash) or shared `JApp/26-27/nnnn` (upi+card); sequences independent
- [ ] Split Cash+UPI Excel: Cash export amount is the cash line only; UPI export is the UPI line only; All emits two rows
- [ ] Repeated export / different mode cards keep the same persisted `voucher_no`
- [ ] Invoice dated before 2-Sep-2026 and cheque/bank/other have blank `voucher_no`
- [ ] Invoice dated 8-Sep with payment received 11-Sep still gets a voucher (invoice_date controls)
- [ ] Accounts `invoice_date` NULL with unique DMS labour `invoice_date` on/after 2-Sep-2026 still gets RApp/JApp; existing numbered receipts are not renumbered (DBL-0060)
- [ ] UPI/card posted before unique DMS exists stays `voucher_no` NULL; when unique DMS labour dated on/after 2-Sep arrives, that line receives the next JApp without rewriting existing vouchers (DBL-0074)
- [ ] Accounts invoice date filled later on a NULL-voucher cash/UPI/card line assigns RApp/JApp; already-assigned numbers stay immutable
- [ ] Eligible cash/UPI/card with blank `voucher_no` blocks Mechanical Busy Export (no xlsx). cheque/bank/other still skipped and do not block. Pre-cutoff blanks are omitted, not exported empty.
- [ ] `account_name` prefers BUSY Party Name for the invoice (`IMBTAI2627007397` → `JAGDISH NARAYAN YADAV-SITAPURA RJ45CV5192`); unmatched invoices keep `OWNER-BRANCH VRN`; missing owner on fallback → blank account_name
- [ ] Duplicate BUSY labour invoice numbers do not pick an arbitrary Party Name (Accounts fallback + toast)
- [ ] Pending case with no receipts still exports one row with blank `voucher_no`
- [ ] **Busy Export** (Mechanical): headers Invoice date, voucher_no, Account DR, Account CR, Amount DR, Amount CR, Reference no; cash DR `CASH AT SITAPURA`; UPI `PAYTM WALLET`; card `CREDIT CARD A/C`; Account CR for `IMBTAI2627007397` is `JAGDISH NARAYAN YADAV-SITAPURA RJ45CV5192`; split Cash+UPI is two rows; cheque/bank/other skipped; pending without receipts omitted; Export Excel unchanged
- [ ] **Busy Export** Invoice date is `payment_received_date` when present (even if Accounts `invoice_date` differs); otherwise Accounts `invoice_date`; otherwise unique DMS labour `invoice_date`; blank dates are skipped/warned, not exported. Split receipts with different received dates keep their own date. `voucher_no` is persisted only. Amount DR = Amount CR. Eligibility remains `invoice_date >= 2026-09-02`.
- [ ] Overpayment posts the entered amount (₹3,700 vs remaining ₹3,680 stays ₹3,700). Remaining display floors at ₹0; `payment_status` becomes received. Busy Export Amount DR/CR = ₹3,700.
- [ ] Remaining ₹150 of billed ₹10,000: `payment_status` stays partial; Gatepass eligible (2%); wording "Gatepass allowed — short amount within 2% tolerance". No fake payment/discount line.
- [ ] Remaining ₹199 / ₹200 of billed ₹10,000: Gatepass eligible. Remaining ₹201 / ₹200.01: Gatepass denied unless valid Keep on Credit.
- [ ] Remaining ₹300 of billed ₹10,000: Gatepass disabled unless valid Keep on Credit.
- [ ] Keep on Credit requires Admin, GM, or module `accounts_keep_on_credit` (View or Modify). Not `accounts.can_modify`. Unauthorized RPC is denied. Remaining and status unchanged.
- [ ] Approve Keep on Credit with blank reason is rejected (UI + RPC `23514`). Checking the box alone does not enable Gatepass.
- [ ] Valid reason persists `keep_on_credit_reason`, `keep_on_credit_approved_by` (authenticated actor), `keep_on_credit_approved_at` (server timestamp). Reload/reopen still shows them.
- [ ] Non-GM user with Admin grant of `accounts_keep_on_credit` can approve; reason/actor/time persist.
- [ ] `issue_accounts_mechanical_gatepass` rejects remaining > 2% without valid Keep on Credit (no client eligible flag). Direct RPC bypass fails.
- [ ] Authorized revoke sets `keep_on_credit=false`, records `keep_on_credit_revoked_by` / `keep_on_credit_revoked_at`, preserves original reason/approver. Gatepass immediately ineligible if remaining > 2%.
- [ ] Keep on Credit checkbox is not freely usable; unauthorized users see the audit when present but cannot approve or revoke.
- [ ] Cash / UPI / Credit Card KPIs follow Received/Pending/All; Period is receipt date (`payment_received_date`, IST `posted_at` fallback), not Mark Done. A 10-Sep Mark Done case with cash received 12-Sep is included in 12-Sep Cash. A 12-Sep Mark Done case with cash received 13-Sep is omitted from 12-Sep Cash.
- [ ] Discount `reference` (`DISCOUNT` / `discount`) contributes ₹0 to Cash/UPI/Card even when stored payment_mode is cash/upi/card. Cash ₹10,000 + Discount ₹29.76 cash → Cash KPI ₹10,000.
- [ ] Received + Cash KPI equals in-range actual cash on Received cases (13-Sep live: ₹10,300 not ₹16,900)
- [ ] Clicking Cash does not zero the UPI or Credit Card tiles
- [ ] Mechanical table **Received Amount** is after Billed and before Remaining; sums payment lines minus `reference` Discount (`DISCOUNT` / trim+case); genuine `other` stays in
- [ ] Admin sees Receipts **Action** / **Edit**; non-admin table stays read-only with no empty Action column
- [ ] Admin Edit can change received date, mode, amount (> 0, overpayment allowed), and reference; Save reloads lines + Received/Remaining/Status/Gatepass
- [ ] Cancel discards the inline edit and does not write the database
- [ ] Non-admin `update_accounts_mechanical_payment` RPC is denied (`42501`); authenticated has no direct UPDATE on `accounts_mechanical_payment_lines`
- [ ] After amount edit, `accounts_mechanical_recalc` updates `amount_received` / `payment_status`; remaining floors at 0; sibling lines unchanged
- [ ] Editing a fully paid split so remaining > 2% makes Gatepass unavailable unless valid Keep on Credit exists
- [ ] `voucher_no` is preserved on edit; `posted_by` / `posted_at` are preserved; `edited_by` / `edited_at` are stamped
- [ ] Bodyshop settlement receipts are unchanged

## Bodyshop

- [ ] Invoice number + billed amount appears, including insurance due ₹0
- [ ] Default filter is outstanding > 0 (DO remaining or customer remaining)
- [ ] Post Payment opens Stage 18 Settlement Receipt (Section A DO + Section B customer)
- [ ] Customer receipt/refund updates customer posted / remaining only
- [ ] DO receipt posts via existing MAIN path; insurance due and overall status update
- [ ] Example 43395 / 41195 / 2200: ₹30k DO → due 11195 overall Partial; ₹2200 customer → customer Received overall still Partial; remaining DO → overall Received
- [ ] Recovery list still insurance due only; `/busy` still exports
