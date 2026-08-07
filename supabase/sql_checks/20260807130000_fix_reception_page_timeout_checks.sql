-- Post-apply checks for 20260807130000_fix_reception_page_timeout.sql

SELECT p.proname, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'list_reception_entries_page',
    'create_reception_entry',
    'update_reception_entry'
  )
ORDER BY p.proname;

SELECT has_function_privilege(
  'authenticated',
  'public.list_reception_entries_page(timestamptz, timestamptz, integer, timestamptz, bigint, text[], text, boolean)',
  'EXECUTE'
) AS list_rpc_execute;

SELECT has_function_privilege(
  'authenticated',
  'public.create_reception_entry(text, text, text, text, text, text, text, integer, text, text)',
  'EXECUTE'
) AS create_rpc_execute;

SELECT has_function_privilege(
  'authenticated',
  'public.update_reception_entry(bigint, text, text, text, text, text, text, text, integer, text, text)',
  'EXECUTE'
) AS update_rpc_execute;
