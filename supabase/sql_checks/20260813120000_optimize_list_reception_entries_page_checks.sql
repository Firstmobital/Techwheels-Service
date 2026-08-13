-- Post-apply checks for 20260813120000_optimize_list_reception_entries_page.sql

SELECT p.proname, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'list_reception_entries_page',
    'list_reception_jc_numbers_by_sa',
    'list_reception_reg_created_since',
    'get_reception_entries_by_ids'
  )
ORDER BY p.proname;

SELECT has_function_privilege(
  'authenticated',
  'public.list_reception_entries_page(timestamptz, timestamptz, integer, timestamptz, bigint, text[], text, boolean)',
  'EXECUTE'
) AS list_rpc_execute;

SELECT has_function_privilege(
  'authenticated',
  'public.list_reception_jc_numbers_by_sa(text)',
  'EXECUTE'
) AS jc_by_sa_execute;

SELECT has_function_privilege(
  'authenticated',
  'public.list_reception_reg_created_since(timestamptz)',
  'EXECUTE'
) AS reg_since_execute;

SELECT has_function_privilege(
  'authenticated',
  'public.get_reception_entries_by_ids(bigint[])',
  'EXECUTE'
) AS by_ids_execute;

-- Default page_size should be 100 in pg_proc proargdefaults (optional sanity)
SELECT pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_function_result(p.oid) AS result
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_reception_entries_page';
