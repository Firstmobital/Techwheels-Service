-- Read-only verification for:
-- supabase/migrations/20261006120000_bodyshop_customer_receipt_allow_excess_due.sql

-- 1) Due receipts: no remaining cap; refund cap preserved
SELECT
  pg_get_functiondef(p.oid) NOT LIKE '%customer receipt cannot exceed remaining recoverable%' AS due_excess_allowed,
  pg_get_functiondef(p.oid) LIKE '%customer refund cannot exceed remaining refund%' AS refund_cap_kept
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_bodyshop_settlement_line';

-- 2) Recalc still derives customer remaining as abs(diff) - posted (may go negative)
SELECT
  pg_get_functiondef(p.oid) LIKE '%abs(v_diff) - v_posted%' AS customer_rem_formula_unchanged
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'recalc_bodyshop_settlement';
