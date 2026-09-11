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
- [ ] User without `accounts` gets AccessDenied at `/accounts`

## Bodyshop

- [ ] Invoice number + billed amount appears, including insurance due ₹0
- [ ] Default filter hides `kind=none` and received
- [ ] Post Payment opens Stage 18 Customer Diff only (no Main/GST/TDS)
- [ ] Customer receipt/refund updates CP and remaining
- [ ] Recovery list still insurance due only; `/busy` still exports
