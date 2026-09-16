-- Read-only verification checks for:
-- supabase/migrations/20260916140000_accounts_mechanical_payment_line_remark.sql
-- Execution: This file can be run in one go.

-- 1) remark column exists, nullable, no invented backfill required
SELECT
  c.column_name,
  c.data_type,
  c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'accounts_mechanical_payment_lines'
  AND c.column_name IN (
    'amount', 'payment_mode', 'reference', 'payment_received_date',
    'posted_at', 'remark', 'payment_notes'
  )
ORDER BY c.column_name;

-- payment_notes must remain on the invoice header, not the line table
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'accounts_mechanical_payment_lines'
      AND column_name = 'remark'
  ) AS remark_on_payment_lines,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'accounts_mechanical_payment_lines'
      AND column_name = 'payment_notes'
  ) AS payment_notes_not_on_lines,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'accounts_mechanical_invoices'
      AND column_name = 'payment_notes'
  ) AS payment_notes_still_on_invoice;

-- 2) Historical rows remain loadable with null remark
SELECT
  count(*) AS payment_lines,
  count(*) FILTER (WHERE remark IS NULL) AS null_remarks,
  count(*) FILTER (WHERE remark IS NOT NULL) AS populated_remarks
FROM public.accounts_mechanical_payment_lines;

-- 3) add_accounts_mechanical_payment: 6-arg, SECURITY DEFINER, writes remark, keeps overpay/voucher
SELECT
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
  pg_get_functiondef(p.oid) LIKE '%p_remark%' AS has_p_remark,
  pg_get_functiondef(p.oid) LIKE '%NULLIF(btrim(p_remark), '''')%' AS trims_remark,
  pg_get_functiondef(p.oid) LIKE '%voucher_no%' AS still_writes_voucher,
  pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_recalc%' AS calls_recalc,
  pg_get_functiondef(p.oid) NOT LIKE '%exceeds remaining%' AS does_not_cap_remaining,
  pg_get_functiondef(p.oid) LIKE '%receipt amount must be greater than 0%' AS rejects_non_positive
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_accounts_mechanical_payment'
ORDER BY args;

-- 4) No leftover 5-arg add/update overloads
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'add_accounts_mechanical_payment',
    'update_accounts_mechanical_payment'
  )
ORDER BY p.proname, args;

-- 5) update_accounts_mechanical_payment: is_admin gate, writes remark, preserves voucher/posted
SELECT
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
  pg_get_functiondef(p.oid) LIKE '%public.is_admin()%' AS uses_is_admin,
  pg_get_functiondef(p.oid) LIKE '%p_remark%' AS has_p_remark,
  pg_get_functiondef(p.oid) LIKE '%remark = NULLIF(btrim(p_remark), '''')%' AS updates_remark,
  pg_get_functiondef(p.oid) LIKE '%PERFORM public.accounts_mechanical_recalc%' AS calls_recalc,
  pg_get_functiondef(p.oid) NOT LIKE '%voucher_no%' AS does_not_touch_voucher_no,
  pg_get_functiondef(p.oid) NOT LIKE '%posted_by%' AS does_not_touch_posted_by
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'update_accounts_mechanical_payment';

-- 6) list still returns whole line JSON (remark included via to_jsonb)
SELECT
  pg_get_functiondef(p.oid) LIKE '%to_jsonb(l)%' AS list_returns_line_json
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_accounts_mechanical_payments';

-- 7) Recalc / remaining / gatepass helpers unchanged
SELECT
  public.accounts_mechanical_remaining_amount(2271.40, 2281.00) = 0 AS overpay_remaining_floored,
  public.accounts_mechanical_remaining_amount(10000, 9500) = 500 AS remaining_500,
  public.accounts_mechanical_gatepass_reason(10000, 9500, false) IS NULL AS remaining_500_gatepass_denied,
  public.accounts_mechanical_gatepass_reason(10000, 10000, false) = 'paid' AS full_paid;

-- 8) Authenticated still has SELECT only
SELECT
  has_table_privilege('authenticated', 'public.accounts_mechanical_payment_lines', 'SELECT') AS auth_select,
  has_table_privilege('authenticated', 'public.accounts_mechanical_payment_lines', 'UPDATE') AS auth_update,
  has_table_privilege('authenticated', 'public.accounts_mechanical_payment_lines', 'INSERT') AS auth_insert,
  has_table_privilege('authenticated', 'public.accounts_mechanical_payment_lines', 'DELETE') AS auth_delete;
