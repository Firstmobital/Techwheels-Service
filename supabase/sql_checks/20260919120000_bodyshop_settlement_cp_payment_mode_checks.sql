-- Read-only verification checks for:
-- supabase/migrations/20260919120000_bodyshop_settlement_cp_payment_mode.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Column exists, text, nullable (historical CP and insurance lines stay NULL)
SELECT
  column_name = 'payment_mode'
  AND data_type = 'text'
  AND is_nullable = 'YES'
    AS payment_mode_column_ok
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bodyshop_settlement_lines'
  AND column_name = 'payment_mode';

-- 2) CHECK matches Accounts mechanical stored values
SELECT
  c.conname = 'bodyshop_settlement_lines_payment_mode_check'
  AND pg_get_constraintdef(c.oid) LIKE '%cash%'
  AND pg_get_constraintdef(c.oid) LIKE '%upi%'
  AND pg_get_constraintdef(c.oid) LIKE '%card%'
  AND pg_get_constraintdef(c.oid) LIKE '%cheque%'
  AND pg_get_constraintdef(c.oid) LIKE '%bank%'
  AND pg_get_constraintdef(c.oid) LIKE '%other%'
  AND pg_get_constraintdef(c.oid) LIKE '%IS NULL%'
    AS payment_mode_check_ok
FROM pg_constraint c
WHERE c.conname = 'bodyshop_settlement_lines_payment_mode_check'
  AND c.conrelid = 'public.bodyshop_settlement_lines'::regclass;

-- 3) Post RPC has payment_mode arg, remains SECURITY DEFINER, extra over DO still allowed
SELECT
  p.proname = 'add_bodyshop_settlement_line'
  AND p.prosecdef
  AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  AND pg_get_function_identity_arguments(p.oid) LIKE '%p_payment_mode%'
  AND pg_get_function_identity_arguments(p.oid) LIKE '%p_import_row_token%'
  AND pg_get_functiondef(p.oid) NOT LIKE '%cannot exceed DO amount%'
  AND pg_get_functiondef(p.oid) LIKE '%payment_mode%'
    AS post_rpc_payment_mode_ok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_bodyshop_settlement_line';

-- 4) No leftover 12-arg overload (PostgREST named-arg posting)
SELECT count(*) = 1 AS single_add_bodyshop_settlement_line_overload
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_bodyshop_settlement_line';

-- 5) Insurance inserts do not write payment_mode; CP receipt insert does
SELECT
  pg_get_functiondef(p.oid) LIKE '%''do_component'', ''MAIN''%'
  AND pg_get_functiondef(p.oid) LIKE '%import_row_token, payment_mode%'
  AND pg_get_functiondef(p.oid) LIKE '%''receipt'', ''CUSTOMER''%'
    AS cp_only_payment_mode_write_ok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_bodyshop_settlement_line';
