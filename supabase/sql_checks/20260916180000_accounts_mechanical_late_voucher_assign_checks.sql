-- Read-only verification checks for:
-- supabase/migrations/20260916180000_accounts_mechanical_late_voucher_assign.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Helpers exist, SECURITY DEFINER, authenticated cannot execute
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute_should_be_false
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'accounts_mechanical_reconcile_japp_sequence',
    'accounts_mechanical_assign_eligible_null_vouchers',
    'accounts_mechanical_assign_vouchers_on_dms',
    'accounts_mechanical_next_voucher_no',
    'accounts_mechanical_effective_invoice_date'
  )
ORDER BY p.proname;

-- 2) Assigner reuses existing eligibility authorities, never SET of a non-null voucher
SELECT
  pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_effective_invoice_date%'
    AND pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_next_voucher_no%'
    AND pg_get_functiondef(p.oid) LIKE '%AND voucher_no IS NULL%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%SET voucher_no = NULL%'
    AS assigner_reuses_authorities_null_only
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'accounts_mechanical_assign_eligible_null_vouchers';

-- 3) upsert fills NULL invoice_date after receipts, then assigns; billed stays locked
SELECT
  pg_get_functiondef(p.oid) LIKE '%COALESCE(v_existing.invoice_date, p_invoice_date)%'
    AND pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_assign_eligible_null_vouchers(p_reception_entry_id, NULL)%'
    AND pg_get_functiondef(p.oid) LIKE '%v_billed := v_existing.billed_amount%'
    AS upsert_fills_null_date_then_assigns
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'upsert_accounts_mechanical_invoice';

-- 4) DMS trigger present on the existing labour table
SELECT
  t.tgname,
  pg_get_triggerdef(t.oid) LIKE '%accounts_mechanical_assign_vouchers_on_dms%'
    AS uses_assigner
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'psf_revenue_dms'
  AND t.tgname = 'trg_psf_revenue_dms_assign_mechanical_vouchers'
  AND NOT t.tgisinternal;

-- 5) JApp sequence is not behind persisted max; next number is unused
SELECT
  s.last_value AS japp_last_value,
  COALESCE(max(substring(l.voucher_no from '([0-9]{4})$')::bigint), 0) AS persisted_max,
  s.last_value >= COALESCE(max(substring(l.voucher_no from '([0-9]{4})$')::bigint), 0)
    AS seq_not_behind_persisted,
  NOT EXISTS (
    SELECT 1
    FROM public.accounts_mechanical_payment_lines x
    WHERE x.voucher_no = 'JApp/26-27/' || lpad((s.last_value + 1)::text, 4, '0')
  ) AS next_japp_unused
FROM public.accounts_mechanical_voucher_japp_2627_seq s
CROSS JOIN public.accounts_mechanical_payment_lines l
WHERE l.voucher_no ~ '^JApp/26-27/[0-9]{4}$'
GROUP BY s.last_value;

-- 6) Historical repair + immutability of already-posted BUSY vouchers
SELECT
  (SELECT voucher_no FROM public.accounts_mechanical_payment_lines WHERE id = 221)
    = 'JApp/26-27/0140' AS ravi_221_still_japp_0140,
  (SELECT reference FROM public.accounts_mechanical_payment_lines WHERE id = 221)
    = '625876335077' AS ravi_221_reference,
  (SELECT id FROM public.accounts_mechanical_payment_lines WHERE voucher_no = 'JApp/26-27/0140')
    = 221 AS japp_0140_still_only_line_221,
  (SELECT voucher_no FROM public.accounts_mechanical_payment_lines WHERE id = 222)
    ~ '^JApp/26-27/[0-9]{4}$' AS ramesh_222_has_japp,
  (SELECT voucher_no FROM public.accounts_mechanical_payment_lines WHERE id = 222)
    IS DISTINCT FROM 'JApp/26-27/0140' AS ramesh_222_not_0140,
  (SELECT reference FROM public.accounts_mechanical_payment_lines WHERE id = 222)
    = '170704572596' AS ramesh_222_reference,
  (SELECT payment_mode FROM public.accounts_mechanical_payment_lines WHERE id = 222)
    = 'upi' AS ramesh_222_still_upi;

-- 7) No eligible cash/upi/card NULLs remain; unsupported/pre-cutoff NULLs untouched
SELECT
  count(*) FILTER (
    WHERE l.payment_mode IN ('cash', 'upi', 'card')
      AND l.voucher_no IS NULL
      AND public.accounts_mechanical_effective_invoice_date(l.reception_entry_id) >= DATE '2026-09-02'
  ) AS eligible_missing_should_be_0,
  count(*) FILTER (
    WHERE l.payment_mode IN ('cash', 'upi', 'card')
      AND l.voucher_no IS NULL
      AND public.accounts_mechanical_effective_invoice_date(l.reception_entry_id) < DATE '2026-09-02'
  ) AS pre_cutoff_null_kept,
  count(*) FILTER (
    WHERE l.payment_mode NOT IN ('cash', 'upi', 'card')
      AND l.voucher_no IS NULL
  ) AS unsupported_null_kept,
  count(*) FILTER (
    WHERE l.payment_mode NOT IN ('cash', 'upi', 'card')
      AND l.voucher_no IS NOT NULL
  ) AS unsupported_with_voucher_should_be_0,
  count(*) FILTER (WHERE l.voucher_no LIKE 'JApp/26-27/%') AS japp_assigned,
  count(DISTINCT l.voucher_no) FILTER (WHERE l.voucher_no LIKE 'JApp/26-27/%') AS japp_distinct
FROM public.accounts_mechanical_payment_lines l;

-- 8) Protect trigger still blocks rewriting a non-null voucher
SELECT
  pg_get_functiondef(p.oid) LIKE '%voucher_no is immutable once assigned%'
    AS protect_trigger_fn_present
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'accounts_mechanical_payment_lines_protect_voucher';
