# RBAC-002 Regression Fix Evidence: Bodyshop Assignments Dealer Code Backfill

Date: 2026-06-22
Status: VERIFIED
Scope: Fix non-admin Bodyshop Floor state visibility regression caused by non-canonical dealer_code values in public.bodyshop_assignments.

## Executed Artifact

1. supabase/migrations/20260622111500_backfill_bodyshop_assignments_dealer_code_from_reception.sql

## Verification Artifact

1. supabase/sql_checks/20260622111500_backfill_bodyshop_assignments_dealer_code_from_reception_checks.sql

## Exact Check Outputs (Operator-Provided)

### Check 1

| location_like_dealer_code_rows |
| ------------------------------ |
| 0 |

### Check 2

| mismatch_rows |
| ------------- |
| 0 |

### Check 3 (Known Regression Row)

| id | job_card_number | assignment_dealer_code | reception_entry_id | reception_dealer_code | branch | sa_employee_code |
| -- | --------------- | ---------------------- | ------------------ | --------------------- | ------ | ---------------- |
| 11 | JC-AAAAA-DFDF-ERFDFG-0001 | 3000840 | 2942 | 3000840 | Sitapura | PAG1_3000840 |

### Check 4 (Recent Sample)

| id | job_card_number | dealer_code | updated_at |
| -- | --------------- | ----------- | ---------- |
| 11 | JC-AAAAA-DFDF-ERFDFG-0001 | 3000840 | 2026-06-22 05:08:15.003643+00 |

## Interpretation

1. No bodyshop_assignments rows remain with location labels (Sitapura/Ajmer Road) in dealer_code.
2. No mismatch remains between assignment dealer_code and linked reception dealer_code.
3. The exact regression row is now canonicalized to dealer_code 3000840.
4. Non-admin RLS path that depends on dealer_code_in_scope(dealer_code) is now aligned for scoped users.

## Conclusion

Regression is fixed and verified with zero-drift SQL checks. The known affected card JC-AAAAA-DFDF-ERFDFG-0001 now has canonical dealer scope data and should render consistent state for scoped non-admin users and admin users.
