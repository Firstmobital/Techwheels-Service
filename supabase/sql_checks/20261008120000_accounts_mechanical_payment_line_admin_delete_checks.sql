-- Read-only verification checks for:
-- supabase/migrations/20261008120000_accounts_mechanical_payment_line_admin_delete.sql
-- Execution: This file can be run in one go.

-- 1) Trusted RPC exists, SECURITY DEFINER, authenticated EXECUTE, is_admin gate, recalc reuse
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
  pg_get_functiondef(p.oid) LIKE '%public.is_admin()%' AS uses_is_admin,
  pg_get_functiondef(p.oid) NOT LIKE '%accounts.can_modify%' AS does_not_use_accounts_modify,
  pg_get_functiondef(p.oid) LIKE '%PERFORM public.accounts_mechanical_recalc%' AS calls_recalc,
  pg_get_functiondef(p.oid) LIKE '%DELETE FROM public.accounts_mechanical_payment_lines%' AS hard_deletes_line,
  pg_get_functiondef(p.oid) LIKE '%INSERT INTO public.audit_logs%' AS writes_audit_log
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'delete_accounts_mechanical_payment';

-- 2) Authenticated has SELECT only on payment lines (no direct DELETE)
SELECT
  has_table_privilege('authenticated', 'public.accounts_mechanical_payment_lines', 'SELECT') AS auth_select,
  has_table_privilege('authenticated', 'public.accounts_mechanical_payment_lines', 'UPDATE') AS auth_update,
  has_table_privilege('authenticated', 'public.accounts_mechanical_payment_lines', 'INSERT') AS auth_insert,
  has_table_privilege('authenticated', 'public.accounts_mechanical_payment_lines', 'DELETE') AS auth_delete;

-- 3) Recalc authority unchanged
SELECT
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'accounts_mechanical_recalc'
  ) AS recalc_exists,
  public.accounts_mechanical_remaining_amount(10000, 0) = 10000 AS zero_received_remaining;
