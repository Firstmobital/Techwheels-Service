-- Read-only verification checks for:
-- supabase/migrations/20260916130000_accounts_mechanical_payment_line_admin_edit.sql
-- Execution: This file can be run in one go.

-- 1) Audit columns on the existing payment-line table
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts_mechanical_payment_lines'
      AND column_name = 'edited_by'
  ) AS edited_by_col,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts_mechanical_payment_lines'
      AND column_name = 'edited_at'
  ) AS edited_at_col,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts_mechanical_payment_lines'
      AND column_name = 'posted_by'
  ) AS posted_by_preserved,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts_mechanical_payment_lines'
      AND column_name = 'posted_at'
  ) AS posted_at_preserved,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts_mechanical_payment_lines'
      AND column_name = 'voucher_no'
  ) AS voucher_no_col;

-- 2) Authenticated has SELECT only (no direct UPDATE)
SELECT
  has_table_privilege('authenticated', 'public.accounts_mechanical_payment_lines', 'SELECT') AS auth_select,
  has_table_privilege('authenticated', 'public.accounts_mechanical_payment_lines', 'UPDATE') AS auth_update,
  has_table_privilege('authenticated', 'public.accounts_mechanical_payment_lines', 'INSERT') AS auth_insert,
  has_table_privilege('authenticated', 'public.accounts_mechanical_payment_lines', 'DELETE') AS auth_delete;

-- 3) Trusted RPC exists, SECURITY DEFINER, authenticated EXECUTE, is_admin gate, recalc reuse
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
  pg_get_functiondef(p.oid) LIKE '%public.is_admin()%' AS uses_is_admin,
  pg_get_functiondef(p.oid) NOT LIKE '%accounts.can_modify%' AS does_not_use_accounts_modify,
  pg_get_functiondef(p.oid) LIKE '%PERFORM public.accounts_mechanical_recalc%' AS calls_recalc,
  pg_get_functiondef(p.oid) LIKE '%receipt amount must be greater than 0%' AS rejects_non_positive,
  pg_get_functiondef(p.oid) NOT LIKE '%exceeds remaining%' AS does_not_cap_remaining,
  pg_get_functiondef(p.oid) NOT LIKE '%voucher_no%' AS does_not_touch_voucher_no,
  pg_get_functiondef(p.oid) NOT LIKE '%posted_by%' AS does_not_touch_posted_by,
  pg_get_functiondef(p.oid) LIKE '%SET amount = v_amount%' AS updates_amount
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'update_accounts_mechanical_payment';

-- 4) Voucher immutability trigger still present; CHECK is format-only (mode edits may keep series)
SELECT
  EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'accounts_mechanical_payment_lines'
      AND t.tgname = 'trg_accounts_mechanical_payment_lines_protect_voucher'
      AND NOT t.tgisinternal
  ) AS voucher_protect_trigger,
  pg_get_constraintdef(c.oid) AS voucher_check_def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'accounts_mechanical_payment_lines'
  AND c.conname = 'accounts_mechanical_payment_lines_voucher_check';

-- 5) Recalc + gatepass helpers still the Accounts authority (no duplicated payment-total function)
SELECT
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'accounts_mechanical_recalc'
  ) AS recalc_exists,
  public.accounts_mechanical_remaining_amount(2271.40, 2281.00) = 0 AS overpay_remaining_floored,
  public.accounts_mechanical_remaining_amount(10000, 9500) = 500 AS remaining_500,
  public.accounts_mechanical_gatepass_reason(10000, 9500, false) IS NULL AS remaining_500_gatepass_denied,
  public.accounts_mechanical_gatepass_reason(10000, 10000, false) = 'paid' AS full_paid,
  public.accounts_mechanical_gatepass_reason(2271.40, 2281.00, false) = 'paid' AS overpay_paid;

-- 6) Bodyshop settlement objects unchanged by this Accounts Mechanical RPC
SELECT
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'add_bodyshop_settlement_line'
  ) AS bodyshop_add_line_exists,
  (
    SELECT pg_get_functiondef(p.oid) NOT LIKE '%update_accounts_mechanical_payment%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'add_bodyshop_settlement_line'
    LIMIT 1
  ) AS bodyshop_add_untouched;
