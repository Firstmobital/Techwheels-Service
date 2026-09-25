-- Read-only verification for:
-- supabase/migrations/20260925170000_settings_customer_helpdesk_contacts.sql

-- 1) Table + RLS enabled
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'settings_customer_helpdesk_contacts';

-- 2) Seed rows (5 defaults) and active count
SELECT
  count(*) AS total_rows,
  count(*) FILTER (WHERE is_active) AS active_rows,
  count(*) FILTER (WHERE group_key = 'dealership') AS dealership_rows,
  count(*) FILTER (WHERE group_key = 'tata_motors') AS tata_rows
FROM public.settings_customer_helpdesk_contacts;

-- 3) Policies (expect 4: select/insert/update/delete v1)
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'public.settings_customer_helpdesk_contacts'::regclass
ORDER BY polname;

-- 4) Anon must not have table privileges (customer uses RPC)
SELECT
  has_table_privilege('anon', 'public.settings_customer_helpdesk_contacts', 'SELECT') AS anon_select_should_be_false,
  has_table_privilege('authenticated', 'public.settings_customer_helpdesk_contacts', 'SELECT') AS auth_select_should_be_true;

-- 5) Customer RPC callable by anon
SELECT has_function_privilege(
  'anon',
  'public.customer_list_helpdesk_contacts(text)',
  'EXECUTE'
) AS anon_can_execute_list_rpc_should_be_true;
