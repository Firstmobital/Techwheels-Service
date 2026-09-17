-- Read-only verification checks for:
-- supabase/migrations/20260917120000_accounts_mechanical_pending_remark.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Pending Remark lives on the existing invoice header, not a new table / not payment lines
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'accounts_mechanical_invoices'
      AND column_name = 'payment_notes'
      AND data_type = 'text'
      AND is_nullable = 'YES'
  ) AS payment_notes_on_invoice,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'accounts_mechanical_invoices'
      AND column_name = 'pending_remark'
  ) AS no_duplicate_pending_remark_column,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'accounts_mechanical_pending_remarks'
  ) AS no_new_remark_table,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'accounts_mechanical_payment_lines'
      AND column_name = 'payment_notes'
  ) AS payment_notes_not_on_lines;

-- 2) Setter: SECURITY DEFINER, accounts access, writes payment_notes, no recalc / voucher / money
SELECT
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
  pg_get_functiondef(p.oid) LIKE '%payment_notes = v_remark%' AS writes_payment_notes,
  pg_get_functiondef(p.oid) LIKE '%NULLIF(btrim(COALESCE(p_pending_remark, '''')), '''')%' AS trims_blank_to_null,
  pg_get_functiondef(p.oid) LIKE '%accounts_can_access%' AS gates_accounts_access,
  pg_get_functiondef(p.oid) LIKE '%capture invoice number and billed amount first%' AS requires_invoice_header,
  pg_get_functiondef(p.oid) NOT LIKE '%accounts_mechanical_recalc%' AS does_not_recalc,
  pg_get_functiondef(p.oid) NOT LIKE '%voucher_no%' AS does_not_touch_vouchers,
  pg_get_functiondef(p.oid) NOT LIKE '%amount_received%' AS does_not_touch_amount_received,
  pg_get_functiondef(p.oid) NOT LIKE '%billed_amount%' AS does_not_rewrite_billed
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'set_accounts_mechanical_pending_remark';

-- 3) List / case JSON still return payment_notes (no second list RPC)
SELECT
  (SELECT pg_get_functiondef(p.oid) LIKE '%inv.payment_notes%'
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'list_accounts_mechanical_cases') AS list_returns_payment_notes,
  (SELECT pg_get_functiondef(p.oid) LIKE '%inv.payment_notes%'
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'accounts_mechanical_case_json') AS case_json_returns_payment_notes;

-- 4) Upsert preserves omitted p_payment_notes (DBL-0075) and still assigns late vouchers (DBL-0074)
SELECT
  pg_get_functiondef(p.oid) LIKE '%v_has_lines OR p_payment_notes IS NULL%' AS preserves_omitted_notes,
  pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_assign_eligible_null_vouchers%' AS still_assigns_vouchers,
  pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_recalc%' AS still_recalcs_after_capture
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'upsert_accounts_mechanical_invoice';

-- 5) Recalc still only writes amount_received / payment_status — never payment_notes
SELECT
  pg_get_functiondef(p.oid) LIKE '%amount_received%' AS recalc_writes_received,
  pg_get_functiondef(p.oid) LIKE '%payment_status%' AS recalc_writes_status,
  pg_get_functiondef(p.oid) NOT LIKE '%payment_notes%' AS recalc_does_not_touch_notes
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'accounts_mechanical_recalc';

-- 6) Remaining / status math unchanged
SELECT
  public.accounts_mechanical_remaining_amount(2271.40, 2281.00) = 0 AS overpay_remaining_floored,
  public.accounts_mechanical_remaining_amount(10000, 9500) = 500 AS remaining_500;

-- 7) Authenticated still cannot write the invoice table directly
SELECT
  has_table_privilege('authenticated', 'public.accounts_mechanical_invoices', 'SELECT') AS auth_select,
  has_table_privilege('authenticated', 'public.accounts_mechanical_invoices', 'UPDATE') AS auth_update,
  has_table_privilege('authenticated', 'public.accounts_mechanical_invoices', 'INSERT') AS auth_insert,
  has_table_privilege('authenticated', 'public.accounts_mechanical_invoices', 'DELETE') AS auth_delete;
