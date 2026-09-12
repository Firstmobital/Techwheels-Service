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
- [ ] User without `accounts` gets AccessDenied at `/accounts`

## Bodyshop

- [ ] Invoice number + billed amount appears, including insurance due ₹0
- [ ] Default filter is outstanding > 0 (DO remaining or customer remaining)
- [ ] Post Payment opens Stage 18 Settlement Receipt (Section A DO + Section B customer)
- [ ] Customer receipt/refund updates customer posted / remaining only
- [ ] DO receipt posts via existing MAIN path; insurance due and overall status update
- [ ] Example 43395 / 41195 / 2200: ₹30k DO → due 11195 overall Partial; ₹2200 customer → customer Received overall still Partial; remaining DO → overall Received
- [ ] Recovery list still insurance due only; `/busy` still exports
