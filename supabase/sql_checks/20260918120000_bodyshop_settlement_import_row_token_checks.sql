-- Read-only verification checks for:
-- supabase/migrations/20260918120000_bodyshop_settlement_import_row_token.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Column exists and is nullable (manual posts stay NULL)
SELECT
  column_name = 'import_row_token'
  AND data_type = 'text'
  AND is_nullable = 'YES'
    AS import_row_token_column_ok
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bodyshop_settlement_lines'
  AND column_name = 'import_row_token';

-- 2) Partial unique index on token + component
SELECT
  i.relname = 'uq_bodyshop_settlement_lines_import_row_token_component'
  AND ix.indisunique
    AS import_row_token_unique_index_ok
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'bodyshop_settlement_lines'
  AND i.relname = 'uq_bodyshop_settlement_lines_import_row_token_component';

-- 3) Post RPC has import token arg, remains SECURITY DEFINER, extra over DO still allowed
SELECT
  p.proname = 'add_bodyshop_settlement_line'
  AND p.prosecdef
  AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  AND pg_get_function_identity_arguments(p.oid) LIKE '%p_import_row_token%'
  AND pg_get_functiondef(p.oid) NOT LIKE '%cannot exceed DO amount%'
  AND pg_get_functiondef(p.oid) LIKE '%import_row_token%'
    AS post_rpc_import_token_ok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_bodyshop_settlement_line';

-- 4) No leftover 11-arg overload (PostgREST named-arg posting)
SELECT count(*) = 1 AS single_add_bodyshop_settlement_line_overload
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_bodyshop_settlement_line';
