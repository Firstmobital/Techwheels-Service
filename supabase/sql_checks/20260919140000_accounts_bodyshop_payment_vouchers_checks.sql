-- Read-only verification checks for:
-- supabase/migrations/20260919140000_accounts_bodyshop_payment_vouchers.sql
-- Execution: This file can be run in one go.

-- 1) voucher_no column exists, text, nullable
SELECT
  column_name = 'voucher_no'
  AND data_type = 'text'
  AND is_nullable = 'YES'
    AS voucher_no_column_ok
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bodyshop_settlement_lines'
  AND column_name = 'voucher_no';

-- 2) Unique partial index + format CHECK
SELECT
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'bodyshop_settlement_lines_voucher_uid'
  ) AS voucher_unique_index_ok,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bodyshop_settlement_lines_voucher_check'
      AND conrelid = 'public.bodyshop_settlement_lines'::regclass
  ) AS voucher_check_ok;

-- 3) Protect trigger present and blocks rewrite
SELECT
  t.tgname = 'trg_bodyshop_settlement_lines_protect_voucher'
  AND pg_get_functiondef(t.tgfoid) LIKE '%voucher_no is immutable once assigned%'
    AS protect_trigger_ok
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'bodyshop_settlement_lines'
  AND t.tgname = 'trg_bodyshop_settlement_lines_protect_voucher'
  AND NOT t.tgisinternal;

-- 3b) Append-only trigger still present; only NULL voucher fill is allowed
SELECT
  pg_get_functiondef(p.oid) LIKE '%bodyshop_settlement_lines are append-only; reverse via RPC%'
  AND pg_get_functiondef(p.oid) LIKE '%OLD.voucher_no IS NULL%'
  AND pg_get_functiondef(p.oid) LIKE '%NEW.payment_mode IS NOT DISTINCT FROM OLD.payment_mode%'
  AND pg_get_functiondef(p.oid) NOT LIKE '%DISABLE TRIGGER%'
    AS append_only_allows_voucher_fill_only
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'prevent_bodyshop_settlement_line_mutation';

-- 4) Allocator reused; no second sequence; no restart
SELECT
  pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_next_voucher_no%'
  AND pg_get_functiondef(p.oid) LIKE '%AND voucher_no IS NULL%'
  AND pg_get_functiondef(p.oid) NOT LIKE '%SET voucher_no = NULL%'
  AND pg_get_functiondef(p.oid) NOT LIKE '%setval%'
    AS assigner_reuses_mechanical_nextval
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'accounts_bodyshop_assign_eligible_null_vouchers';

SELECT
  NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname LIKE 'accounts_bodyshop_voucher%'
  ) AS no_second_bodyshop_sequence;

-- 5) Insert path writes voucher_no on customer receipt only
SELECT
  p.prosecdef
  AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  AND pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_next_voucher_no%'
  AND pg_get_functiondef(p.oid) LIKE '%import_row_token, payment_mode, voucher_no%'
  AND pg_get_functiondef(p.oid) LIKE '%''receipt'', ''CUSTOMER''%'
  AND pg_get_functiondef(p.oid) NOT LIKE '%cannot exceed DO amount%'
    AS post_rpc_assigns_customer_voucher
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_bodyshop_settlement_line';

SELECT count(*) = 1 AS single_add_bodyshop_settlement_line_overload
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_bodyshop_settlement_line';

-- 6) Mechanical sequences still the only RApp/JApp allocators
SELECT
  EXISTS (SELECT 1 FROM pg_class WHERE relname = 'accounts_mechanical_voucher_rapp_2627_seq')
  AND EXISTS (SELECT 1 FROM pg_class WHERE relname = 'accounts_mechanical_voucher_japp_2627_seq')
    AS mechanical_sequences_still_present;

-- 7) Mechanical vouchers were not cleared
SELECT
  count(*) FILTER (WHERE voucher_no LIKE 'RApp/26-27/%') > 0
  AND count(*) FILTER (WHERE voucher_no LIKE 'JApp/26-27/%') > 0
    AS mechanical_vouchers_still_present
FROM public.accounts_mechanical_payment_lines;

-- 8) NULL / unsupported Bodyshop modes remain unvouchered
SELECT
  count(*) FILTER (
    WHERE party = 'customer'
      AND line_type = 'receipt'
      AND component = 'CUSTOMER'
      AND is_reversed = false
      AND payment_mode IS NULL
      AND voucher_no IS NOT NULL
  ) = 0 AS null_mode_has_no_voucher
FROM public.bodyshop_settlement_lines;
