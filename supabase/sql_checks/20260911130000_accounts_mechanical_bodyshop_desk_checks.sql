-- Read-only verification checks for:
-- supabase/migrations/20260911130000_accounts_mechanical_bodyshop_desk.sql
-- Execution: This file can be run in one go after the migration.

-- 1) Module registered
SELECT name, label, route, sort_order, is_active
FROM public.modules
WHERE name = 'accounts';

-- 2) Mechanical table + constraints
SELECT
  EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accounts_mechanical_invoices'
  ) AS mechanical_table_exists,
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accounts_mechanical_invoices_reception_uid'
  ) AS reception_unique,
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accounts_mechanical_invoices_pay_check'
  ) AS payment_status_check;

-- 3) RPCs exist, SECURITY DEFINER, executable by authenticated
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'accounts_can_access',
    'list_accounts_mechanical_cases',
    'upsert_accounts_mechanical_invoice',
    'list_accounts_bodyshop_cases',
    'bodyshop_settlement_can_post_customer'
  )
ORDER BY p.proname;

-- 4) Customer path accepts accounts; DO path still does not mention accounts
SELECT
  pg_get_functiondef(p.oid) LIKE '%bodyshop_settlement_can_post_customer%' AS customer_uses_accounts_helper,
  pg_get_functiondef(p.oid) LIKE '%bodyshop_settlement_can_post_do%' AS do_path_unchanged
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_bodyshop_settlement_line';

-- 5) Bodyshop list is invoice+billed, not insurance-due-only
SELECT
  pg_get_functiondef(p.oid) LIKE '%invoice_number%'
  AND pg_get_functiondef(p.oid) LIKE '%invoice_amount%'
  AND pg_get_functiondef(p.oid) NOT LIKE '%insurance_due_amount > 0%' AS billed_not_recovery
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_accounts_bodyshop_cases';

-- 6) Mechanical list uses Mark Done + floor type
SELECT
  pg_get_functiondef(p.oid) LIKE '%invoice_done_at IS NOT NULL%'
  AND pg_get_functiondef(p.oid) LIKE '%is_floor_incharge_service_type%' AS mechanical_mark_done_floor
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_accounts_mechanical_cases';

-- 7) Recovery list still insurance-due only
SELECT
  pg_get_functiondef(p.oid) LIKE '%insurance_due_amount%'
  AND pg_get_functiondef(p.oid) LIKE '%do_amount IS NOT NULL%' AS recovery_still_do_only
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_bodyshop_do_recovery';
