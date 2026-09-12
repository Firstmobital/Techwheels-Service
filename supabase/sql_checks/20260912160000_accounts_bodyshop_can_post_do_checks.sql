-- Read-only verification checks for:
-- supabase/migrations/20260912160000_accounts_bodyshop_can_post_do.sql
-- Execution: This file can be run in one go after the migration.

-- 1) can_post_do includes Accounts and still includes Recovery + repair fallback
SELECT
  pg_get_functiondef(p.oid) LIKE '%has_module_view(''accounts'')%' AS accounts_can_post_do,
  pg_get_functiondef(p.oid) LIKE '%bodyshop_recovery%' AS recovery_still_can_post_do,
  pg_get_functiondef(p.oid) LIKE '%bodyshop_settlement_can_modify%' AS repair_modify_fallback,
  pg_get_functiondef(p.oid) NOT LIKE '%dealer_code_in_scope%' AS accounts_recovery_org_wide
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'bodyshop_settlement_can_post_do';

-- 2) add_bodyshop_settlement_line still uses the same two helpers (no parallel permission)
SELECT
  pg_get_functiondef(p.oid) LIKE '%bodyshop_settlement_can_post_do%' AS do_path_uses_can_post_do,
  pg_get_functiondef(p.oid) LIKE '%bodyshop_settlement_can_post_customer%' AS customer_path_uses_can_post_customer,
  pg_get_functiondef(p.oid) LIKE '%insurance%' AS still_insurance_party,
  pg_get_functiondef(p.oid) LIKE '%CUSTOMER%' AS still_customer_component
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_bodyshop_settlement_line';

-- 3) Accounts Bodyshop list returns overall settlement fields; still billed-not-recovery
SELECT
  pg_get_functiondef(p.oid) LIKE '%derived_payment_status%' AS lists_overall_status,
  pg_get_functiondef(p.oid) LIKE '%outstanding_amount%' AS lists_outstanding,
  pg_get_functiondef(p.oid) LIKE '%do_released_amount%' AS lists_do_released,
  pg_get_functiondef(p.oid) NOT LIKE '%insurance_due_amount > 0%' AS billed_not_recovery,
  pg_get_functiondef(p.oid) NOT LIKE '%2026-09-11%' AS no_mechanical_cutoff
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_accounts_bodyshop_cases';

-- 4) Recovery list still insurance-due only
SELECT
  pg_get_functiondef(p.oid) LIKE '%do_amount IS NOT NULL%'
  AND pg_get_functiondef(p.oid) LIKE '%insurance_due_amount%'
  AND pg_get_functiondef(p.oid) LIKE '%insurance_due_amount, 0) > 0%'
    AS recovery_still_insurance_due_only
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_bodyshop_do_recovery';

-- 5) Mechanical payment table / RPC untouched
SELECT
  EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accounts_mechanical_payment_lines'
  ) AS mechanical_lines_exist,
  (
    SELECT pg_get_functiondef(p.oid) NOT LIKE '%bodyshop_settlement%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'add_accounts_mechanical_payment'
    LIMIT 1
  ) AS mechanical_payment_not_bodyshop;

-- 6) Example 43395 / 41195 / 2200 using the same derived columns as recalc
-- (read-only arithmetic; does not insert ledger rows)
WITH expected AS (
  SELECT
    43395.00::numeric(14,2) AS invoice_amount,
    41195.00::numeric(14,2) AS do_amount,
    2200.00::numeric(14,2) AS customer_diff,
    30000.00::numeric(14,2) AS do_posted_1,
    2200.00::numeric(14,2) AS customer_posted,
    11195.00::numeric(14,2) AS do_posted_2
)
SELECT
  invoice_amount - do_amount = customer_diff AS diff_matches,
  do_amount - do_posted_1 = 11195.00 AS after_do_30k_insurance_due,
  customer_diff - customer_posted = 0 AS after_cust_remaining_zero,
  (do_amount - do_posted_1) + (customer_diff - customer_posted) = 11195.00 AS after_both_outstanding,
  do_amount - (do_posted_1 + do_posted_2) = 0 AS after_remaining_do_due_zero,
  (do_amount - (do_posted_1 + do_posted_2)) + (customer_diff - customer_posted) = 0 AS final_outstanding_zero
FROM expected;
