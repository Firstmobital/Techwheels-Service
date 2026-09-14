# ACCOUNTS-001 Test Matrix

**Plan:** ACCOUNTS-001  
**Created:** 2026-09-11  
**Status:** Ready after DBL-0045 apply

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
- [ ] `account_name` prefers BUSY Party Name for the invoice (`IMBTAI2627007397` → `JAGDISH NARAYAN YADAV-SITAPURA RJ45CV5192`); unmatched invoices keep `OWNER-BRANCH VRN`; missing owner on fallback → blank account_name
- [ ] Duplicate BUSY labour invoice numbers do not pick an arbitrary Party Name (Accounts fallback + toast)
- [ ] Pending case with no receipts still exports one row with blank `voucher_no`
- [ ] **Busy Export** (Mechanical): headers Invoice date, voucher_no, Account DR, Account CR, Amount DR, Amount CR, Reference no; cash DR `CASH AT SITAPURA`; UPI `PAYTM WALLET`; card `CREDIT CARD A/C`; Account CR for `IMBTAI2627007397` is `JAGDISH NARAYAN YADAV-SITAPURA RJ45CV5192`; split Cash+UPI is two rows; cheque/bank/other skipped; pending without receipts omitted; Export Excel unchanged
- [ ] **Busy Export** Invoice date is `payment_received_date` when present (even if Accounts `invoice_date` differs); otherwise Accounts `invoice_date`; otherwise unique DMS labour `invoice_date`; blank dates are skipped/warned, not exported. Split receipts with different received dates keep their own date. `voucher_no` is persisted only. Amount DR = Amount CR. Eligibility remains `invoice_date >= 2026-09-02`.

## Bodyshop

- [ ] Invoice number + billed amount appears, including insurance due ₹0
- [ ] Default filter is outstanding > 0 (DO remaining or customer remaining)
- [ ] Post Payment opens Stage 18 Settlement Receipt (Section A DO + Section B customer)
- [ ] Customer receipt/refund updates customer posted / remaining only
- [ ] DO receipt posts via existing MAIN path; insurance due and overall status update
- [ ] Example 43395 / 41195 / 2200: ₹30k DO → due 11195 overall Partial; ₹2200 customer → customer Received overall still Partial; remaining DO → overall Received
- [ ] Recovery list still insurance due only; `/busy` still exports
