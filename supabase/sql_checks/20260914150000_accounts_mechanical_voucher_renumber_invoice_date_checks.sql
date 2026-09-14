-- Read-only verification checks for:
-- supabase/migrations/20260914150000_accounts_mechanical_voucher_renumber_invoice_date.sql
-- Execution: This file can be run in one go.

-- 1) Allocator still uses invoice_date 2026-09-02
SELECT
  pg_get_functiondef(p.oid) LIKE '%2026-09-02%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%payment_received_date%'
    AND pg_get_functiondef(p.oid) LIKE '%nextval%'
    AS allocator_uses_invoice_date_cutoff
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'accounts_mechanical_next_voucher_no';

-- 2) Protect trigger is enabled again
SELECT
  t.tgenabled = 'O' AS protect_trigger_enabled
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'accounts_mechanical_payment_lines'
  AND t.tgname = 'trg_accounts_mechanical_payment_lines_protect_voucher'
  AND NOT t.tgisinternal;

-- 3) Recalculated series: no gaps vs distinct, no pre-2-Sep vouchers
SELECT
  count(*) FILTER (WHERE l.voucher_no LIKE 'RApp/26-27/%') AS rapp_assigned,
  count(*) FILTER (WHERE l.voucher_no LIKE 'JApp/26-27/%') AS japp_assigned,
  count(DISTINCT l.voucher_no) FILTER (WHERE l.voucher_no LIKE 'RApp/26-27/%') AS rapp_distinct,
  count(DISTINCT l.voucher_no) FILTER (WHERE l.voucher_no LIKE 'JApp/26-27/%') AS japp_distinct,
  min(l.voucher_no) FILTER (WHERE l.voucher_no LIKE 'RApp/26-27/%') AS min_rapp_should_be_0001,
  min(l.voucher_no) FILTER (WHERE l.voucher_no LIKE 'JApp/26-27/%') AS min_japp_should_be_0001,
  count(*) FILTER (
    WHERE inv.invoice_date >= DATE '2026-09-02'
      AND l.payment_mode = 'cash'
      AND l.voucher_no IS NULL
  ) AS eligible_cash_missing_should_be_0,
  count(*) FILTER (
    WHERE inv.invoice_date >= DATE '2026-09-02'
      AND l.payment_mode IN ('upi', 'card')
      AND l.voucher_no IS NULL
  ) AS eligible_japp_missing_should_be_0,
  count(*) FILTER (
    WHERE inv.invoice_date < DATE '2026-09-02' AND l.voucher_no IS NOT NULL
  ) AS pre_2_sep_with_voucher_should_be_0,
  count(*) FILTER (
    WHERE l.payment_mode NOT IN ('cash', 'upi', 'card') AND l.voucher_no IS NOT NULL
  ) AS unsupported_mode_with_voucher_should_be_0
FROM public.accounts_mechanical_payment_lines l
JOIN public.accounts_mechanical_invoices inv ON inv.id = l.mechanical_invoice_id;

-- 4) Chronological series: earlier invoice_date must not have a later number
SELECT
  EXISTS (
    SELECT 1
    FROM public.accounts_mechanical_payment_lines a
    JOIN public.accounts_mechanical_invoices ia ON ia.id = a.mechanical_invoice_id
    JOIN public.accounts_mechanical_payment_lines b ON true
    JOIN public.accounts_mechanical_invoices ib ON ib.id = b.mechanical_invoice_id
    WHERE a.voucher_no LIKE 'RApp/26-27/%'
      AND b.voucher_no LIKE 'RApp/26-27/%'
      AND a.id <> b.id
      AND ia.invoice_date < ib.invoice_date
      AND a.voucher_no > b.voucher_no
  ) AS rapp_inversion_should_be_false,
  EXISTS (
    SELECT 1
    FROM public.accounts_mechanical_payment_lines a
    JOIN public.accounts_mechanical_invoices ia ON ia.id = a.mechanical_invoice_id
    JOIN public.accounts_mechanical_payment_lines b ON true
    JOIN public.accounts_mechanical_invoices ib ON ib.id = b.mechanical_invoice_id
    WHERE a.voucher_no LIKE 'JApp/26-27/%'
      AND b.voucher_no LIKE 'JApp/26-27/%'
      AND a.id <> b.id
      AND ia.invoice_date < ib.invoice_date
      AND a.voucher_no > b.voucher_no
  ) AS japp_inversion_should_be_false;

-- 5) Previously blank invoice examples
SELECT
  inv.invoice_number,
  inv.invoice_date,
  l.payment_mode,
  l.payment_received_date,
  l.voucher_no,
  CASE
    WHEN inv.invoice_date IS NULL THEN 'blank: invoice_date is null'
    WHEN inv.invoice_date < DATE '2026-09-02' THEN 'blank expected: invoice before 2026-09-02'
    WHEN l.payment_mode NOT IN ('cash', 'upi', 'card') THEN 'blank expected: unsupported mode'
    WHEN l.voucher_no IS NULL THEN 'ACTION: eligible but still null'
    ELSE 'ok'
  END AS result
FROM public.accounts_mechanical_invoices inv
LEFT JOIN public.accounts_mechanical_payment_lines l
  ON l.mechanical_invoice_id = inv.id
WHERE inv.invoice_number IN (
  'IMBTAI2627007276',
  'IMBTAI2627007350',
  'IMBTAI2627007332',
  'IMBTAI2627007312',
  'IMBTAI2627007344',
  'IMBTAI2627007374',
  'IMBTAI2627007362',
  'IMBTAI2627007360',
  'IMBTAI2627007389',
  'IMBTAI2627007343',
  'IMBTAI2627007338',
  'IMBTAI2627007294',
  'IMBTAI2627007383',
  'IMBTAI2627007372'
)
ORDER BY inv.invoice_number, l.id;

-- 6) Earliest assigned vouchers after recalculation
SELECT l.id, inv.invoice_number, inv.invoice_date, l.payment_mode, l.payment_received_date, l.voucher_no
FROM public.accounts_mechanical_payment_lines l
JOIN public.accounts_mechanical_invoices inv ON inv.id = l.mechanical_invoice_id
WHERE l.voucher_no IN ('RApp/26-27/0001', 'JApp/26-27/0001')
ORDER BY l.voucher_no;
