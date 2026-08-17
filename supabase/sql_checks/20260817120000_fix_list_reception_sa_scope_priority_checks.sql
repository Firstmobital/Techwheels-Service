-- Post-apply checks for 20260817120000_fix_list_reception_sa_scope_priority.sql

SELECT p.proname, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('list_reception_entries_page', 'list_reception_reg_created_since')
ORDER BY p.proname;

SELECT has_function_privilege(
  'authenticated',
  'public.list_reception_entries_page(timestamptz, timestamptz, integer, timestamptz, bigint, text[], text, boolean)',
  'EXECUTE'
) AS list_rpc_execute;

SELECT p.proname,
       pg_get_functiondef(p.oid) LIKE '%user_needs_sa_summary_broad_scope%' AS uses_broad_scope_helper,
       pg_get_functiondef(p.oid) LIKE '%INNER JOIN public.user_employee_links uel%' AS uses_advisor_join
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('list_reception_entries_page', 'list_reception_reg_created_since')
ORDER BY p.proname;
