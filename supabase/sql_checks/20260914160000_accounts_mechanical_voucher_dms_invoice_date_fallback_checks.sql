-- Read-only verification checks for:
-- supabase/migrations/20260914160000_accounts_mechanical_voucher_dms_invoice_date_fallback.sql
-- Execution: This file can be run in one go.

-- 1) Allocator cutoff unchanged: invoice_date 2026-09-02, nextval, not payment_received_date
SELECT
  pg_get_functiondef(p.oid) LIKE '%2026-09-02%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%payment_received_date%'
    AND pg_get_functiondef(p.oid) LIKE '%nextval%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%MAX(%'
    AS allocator_uses_invoice_date_cutoff
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'accounts_mechanical_next_voucher_no';

-- 2) add_payment uses effective invoice date (Accounts then DMS)
SELECT
  pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_effective_invoice_date%'
    AND pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_next_voucher_no(v_mode, v_eff)%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%v_inv.invoice_date)%'
    AS add_payment_uses_effective_invoice_date
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_accounts_mechanical_payment';

-- 3) Helpers exist, SECURITY DEFINER, authenticated cannot execute
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  p.provolatile = 's' AS stable,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute_should_be_false
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'accounts_mechanical_unique_dms_invoice_date',
    'accounts_mechanical_effective_invoice_date'
  )
ORDER BY p.proname;

-- 4) Existing numbered vouchers were not moved
SELECT
  (SELECT l.id FROM public.accounts_mechanical_payment_lines l WHERE l.voucher_no = 'RApp/26-27/0001') = 41
    AS rapp_0001_still_line_41,
  (SELECT l.id FROM public.accounts_mechanical_payment_lines l WHERE l.voucher_no = 'JApp/26-27/0001') = 108
    AS japp_0001_still_line_108,
  (SELECT l.id FROM public.accounts_mechanical_payment_lines l WHERE l.voucher_no = 'JApp/26-27/0062') = 81
    AS japp_0062_still_line_81,
  (SELECT l.id FROM public.accounts_mechanical_payment_lines l WHERE l.voucher_no = 'JApp/26-27/0063') = 130
    AS japp_0063_still_line_130,
  (SELECT l.id FROM public.accounts_mechanical_payment_lines l WHERE l.voucher_no = 'JApp/26-27/0091') = 172
    AS japp_0091_still_line_172;

-- 5) Series uniqueness + continuation; no eligible missing after fallback
SELECT
  count(*) FILTER (WHERE l.voucher_no LIKE 'RApp/26-27/%') AS rapp_assigned,
  count(*) FILTER (WHERE l.voucher_no LIKE 'JApp/26-27/%') AS japp_assigned,
  count(DISTINCT l.voucher_no) FILTER (WHERE l.voucher_no LIKE 'RApp/26-27/%') AS rapp_distinct,
  count(DISTINCT l.voucher_no) FILTER (WHERE l.voucher_no LIKE 'JApp/26-27/%') AS japp_distinct,
  min(l.voucher_no) FILTER (WHERE l.voucher_no LIKE 'JApp/26-27/%') AS min_japp_should_be_0001,
  max(l.voucher_no) FILTER (WHERE l.voucher_no LIKE 'JApp/26-27/%') AS max_japp,
  count(*) FILTER (
    WHERE l.payment_mode IN ('cash', 'upi', 'card')
      AND l.voucher_no IS NULL
      AND public.accounts_mechanical_effective_invoice_date(l.reception_entry_id) >= DATE '2026-09-02'
  ) AS eligible_missing_should_be_0,
  count(*) FILTER (
    WHERE l.id IN (84, 98, 99, 101, 102, 103, 105, 124, 125, 160, 162)
      AND l.voucher_no LIKE 'JApp/26-27/%'
      AND l.voucher_no > 'JApp/26-27/0091'
  ) AS known_11_new_japp_should_be_11,
  count(*) FILTER (
    WHERE l.payment_mode NOT IN ('cash', 'upi', 'card') AND l.voucher_no IS NOT NULL
  ) AS unsupported_mode_with_voucher_should_be_0
FROM public.accounts_mechanical_payment_lines l;

-- 6) Known 10 UPI + 1 card: Accounts date null, DMS 2026-09-13, now numbered
SELECT
  l.id AS payment_line_id,
  inv.jc_number,
  inv.invoice_date AS accounts_invoice_date,
  public.accounts_mechanical_unique_dms_invoice_date(inv.jc_number) AS dms_invoice_date,
  l.payment_mode,
  l.voucher_no,
  CASE
    WHEN inv.invoice_date IS NOT NULL THEN 'unexpected: Accounts invoice_date present'
    WHEN public.accounts_mechanical_unique_dms_invoice_date(inv.jc_number) < DATE '2026-09-02' THEN 'unexpected: DMS before cutoff'
    WHEN l.voucher_no IS NULL THEN 'ACTION: still null'
    WHEN l.voucher_no NOT LIKE 'JApp/26-27/%' THEN 'ACTION: wrong series'
    WHEN l.voucher_no <= 'JApp/26-27/0091' THEN 'ACTION: reused old number'
    ELSE 'ok'
  END AS result
FROM public.accounts_mechanical_payment_lines l
JOIN public.accounts_mechanical_invoices inv ON inv.id = l.mechanical_invoice_id
WHERE l.id IN (84, 98, 99, 101, 102, 103, 105, 124, 125, 160, 162)
ORDER BY l.id;

-- 7) Protect trigger still enabled; no mass-clear function change
SELECT
  t.tgenabled = 'O' AS protect_trigger_enabled
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'accounts_mechanical_payment_lines'
  AND t.tgname = 'trg_accounts_mechanical_payment_lines_protect_voucher'
  AND NOT t.tgisinternal;
