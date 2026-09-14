-- Read-only verification checks for:
-- supabase/migrations/20260914140000_accounts_mechanical_voucher_invoice_date.sql
-- Execution: This file can be run in one go.

-- 1) Allocator cutoff is invoice_date 2026-09-02, not payment_received_date 2026-09-11
SELECT
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute_should_be_false,
  pg_get_functiondef(p.oid) LIKE '%nextval%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%MAX(%'
    AND pg_get_functiondef(p.oid) LIKE '%2026-09-02%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%payment_received_date%'
    AND pg_get_functiondef(p.oid) LIKE '%RApp/26-27/%'
    AND pg_get_functiondef(p.oid) LIKE '%JApp/26-27/%'
    AS allocator_uses_invoice_date_cutoff
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'accounts_mechanical_next_voucher_no';

-- 2) add_payment passes invoice_date into allocator
SELECT
  pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_next_voucher_no(v_mode, v_inv.invoice_date)%'
    AND pg_get_functiondef(p.oid) LIKE '%voucher_no%'
    AS add_payment_uses_invoice_date
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_accounts_mechanical_payment';

-- 3) CHECK no longer keys off payment_received_date
SELECT
  pg_get_constraintdef(c.oid) NOT LIKE '%payment_received_date%'
    AND pg_get_constraintdef(c.oid) LIKE '%RApp/26-27/%'
    AND pg_get_constraintdef(c.oid) LIKE '%JApp/26-27/%'
    AS voucher_check_not_payment_received_date
FROM pg_constraint c
WHERE c.conname = 'accounts_mechanical_payment_lines_voucher_check';

-- 4) Series uniqueness + no missing vouchers for eligible cash/upi/card
SELECT
  count(*) FILTER (WHERE l.voucher_no LIKE 'RApp/26-27/%') AS rapp_assigned,
  count(*) FILTER (WHERE l.voucher_no LIKE 'JApp/26-27/%') AS japp_assigned,
  count(DISTINCT l.voucher_no) FILTER (WHERE l.voucher_no LIKE 'RApp/26-27/%') AS rapp_distinct,
  count(DISTINCT l.voucher_no) FILTER (WHERE l.voucher_no LIKE 'JApp/26-27/%') AS japp_distinct,
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
    WHERE inv.invoice_date < DATE '2026-09-02'
  ) AS skipped_pre_2_sep,
  count(*) FILTER (
    WHERE inv.invoice_date < DATE '2026-09-02' AND l.voucher_no IS NOT NULL
  ) AS pre_2_sep_with_voucher_preserved_from_dbl_0057,
  (
    count(*) FILTER (WHERE l.voucher_no LIKE 'RApp/26-27/%')
    = count(DISTINCT l.voucher_no) FILTER (WHERE l.voucher_no LIKE 'RApp/26-27/%')
  ) AS rapp_no_duplicates,
  (
    count(*) FILTER (WHERE l.voucher_no LIKE 'JApp/26-27/%')
    = count(DISTINCT l.voucher_no) FILTER (WHERE l.voucher_no LIKE 'JApp/26-27/%')
  ) AS japp_no_duplicates,
  count(*) FILTER (
    WHERE l.payment_mode NOT IN ('cash', 'upi', 'card') AND l.voucher_no IS NOT NULL
  ) AS unsupported_mode_with_voucher_should_be_0,
  count(*) FILTER (
    WHERE inv.invoice_date >= DATE '2026-09-02'
      AND l.payment_mode NOT IN ('cash', 'upi', 'card')
  ) AS skipped_cheque_bank_other,
  count(*) FILTER (
    WHERE inv.invoice_date IS NULL
  ) AS skipped_null_invoice_date
FROM public.accounts_mechanical_payment_lines l
JOIN public.accounts_mechanical_invoices inv ON inv.id = l.mechanical_invoice_id;

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

-- 6) Sample persisted vouchers (2-Sep onward invoices)
SELECT l.id, inv.invoice_number, inv.invoice_date, l.payment_mode, l.payment_received_date, l.voucher_no
FROM public.accounts_mechanical_payment_lines l
JOIN public.accounts_mechanical_invoices inv ON inv.id = l.mechanical_invoice_id
WHERE inv.invoice_date >= DATE '2026-09-02'
  AND l.payment_mode IN ('cash', 'upi', 'card')
ORDER BY inv.invoice_date, l.payment_received_date, l.posted_at, l.id
LIMIT 30;

-- 7) Numbering-conflict evidence: earlier invoice_date with a later series number
-- (expected true if DBL-0057 already issued 11-Sep numbers before this backfill)
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
  ) AS rapp_earlier_invoice_has_later_number,
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
  ) AS japp_earlier_invoice_has_later_number;
