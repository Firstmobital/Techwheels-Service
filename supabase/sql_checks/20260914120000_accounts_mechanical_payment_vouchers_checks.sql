-- Read-only verification checks for:
-- supabase/migrations/20260914120000_accounts_mechanical_payment_vouchers.sql
-- Execution: This file can be run in one go.

-- 1) Column + sequences + unique index
SELECT
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'accounts_mechanical_payment_lines'
      AND column_name = 'voucher_no'
      AND data_type = 'text'
  ) AS voucher_no_text,
  EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
      AND c.relname = 'accounts_mechanical_voucher_rapp_2627_seq'
  ) AS rapp_seq,
  EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
      AND c.relname = 'accounts_mechanical_voucher_japp_2627_seq'
  ) AS japp_seq,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'accounts_mechanical_payment_lines_voucher_uid'
  ) AS voucher_unique_partial,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'accounts_mechanical_payment_lines_voucher_check'
  ) AS voucher_check;

-- 2) Allocator uses nextval, not max()+1; cutoff and series in definition
SELECT
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute_should_be_false,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute,
  pg_get_functiondef(p.oid) LIKE '%nextval%'
    AND pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_voucher_rapp_2627_seq%'
    AND pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_voucher_japp_2627_seq%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%MAX(%'
    AND pg_get_functiondef(p.oid) LIKE '%2026-09-11%'
    AND pg_get_functiondef(p.oid) LIKE '%RApp/26-27/%'
    AND pg_get_functiondef(p.oid) LIKE '%JApp/26-27/%'
    AS allocator_uses_nextval_not_max
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'accounts_mechanical_next_voucher_no';

-- 3) add_payment writes voucher_no at insert
SELECT
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
  pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_next_voucher_no%'
    AND pg_get_functiondef(p.oid) LIKE '%voucher_no%'
    AND pg_get_functiondef(p.oid) LIKE '%payment_received_date%'
    AS add_payment_assigns_voucher
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_accounts_mechanical_payment';

-- 4) Protect trigger present
SELECT
  t.tgname,
  p.proname AS trigger_fn
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public'
  AND c.relname = 'accounts_mechanical_payment_lines'
  AND t.tgname = 'trg_accounts_mechanical_payment_lines_protect_voucher'
  AND NOT t.tgisinternal;

-- 5) list RPC still returns whole line JSON (voucher_no included via to_jsonb)
SELECT
  pg_get_functiondef(p.oid) LIKE '%to_jsonb(l)%'
  AND pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_payment_lines%'
    AS list_returns_line_json
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_accounts_mechanical_payments';

-- 6) Backfill / data shape (read-only counts; do not call nextval)
SELECT
  count(*) FILTER (
    WHERE payment_received_date >= DATE '2026-09-11' AND payment_mode = 'cash'
  ) AS eligible_cash,
  count(*) FILTER (
    WHERE payment_received_date >= DATE '2026-09-11' AND payment_mode IN ('upi', 'card')
  ) AS eligible_upi_card,
  count(*) FILTER (
    WHERE voucher_no LIKE 'RApp/26-27/%'
  ) AS rapp_assigned,
  count(*) FILTER (
    WHERE voucher_no LIKE 'JApp/26-27/%'
  ) AS japp_assigned,
  count(*) FILTER (
    WHERE payment_received_date < DATE '2026-09-11'
  ) AS skipped_pre_cutoff,
  count(*) FILTER (
    WHERE payment_received_date < DATE '2026-09-11' AND voucher_no IS NOT NULL
  ) AS pre_cutoff_with_voucher_should_be_0,
  count(*) FILTER (
    WHERE payment_mode NOT IN ('cash', 'upi', 'card') AND voucher_no IS NOT NULL
  ) AS unsupported_mode_with_voucher_should_be_0,
  count(*) FILTER (
    WHERE payment_received_date >= DATE '2026-09-11'
      AND payment_mode NOT IN ('cash', 'upi', 'card')
  ) AS skipped_cheque_bank_other,
  count(*) FILTER (
    WHERE payment_received_date >= DATE '2026-09-11'
      AND payment_mode = 'cash'
      AND voucher_no IS NULL
  ) AS eligible_cash_missing_voucher_should_be_0,
  count(*) FILTER (
    WHERE payment_received_date >= DATE '2026-09-11'
      AND payment_mode IN ('upi', 'card')
      AND voucher_no IS NULL
  ) AS eligible_japp_missing_voucher_should_be_0
FROM public.accounts_mechanical_payment_lines;

-- 7) Sample persisted vouchers (stable identity)
SELECT id, payment_mode, payment_received_date, voucher_no
FROM public.accounts_mechanical_payment_lines
WHERE voucher_no IS NOT NULL
ORDER BY voucher_no, id
LIMIT 20;
