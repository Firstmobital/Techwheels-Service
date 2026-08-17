-- Post-apply checks for 20260817140000_optimize_reception_list_broad_path.sql

SELECT p.proname,
       pg_get_functiondef(p.oid) LIKE '%user_needs_sa_summary_broad_scope%' AS has_sa_fast_path_gate,
       pg_get_functiondef(p.oid) LIKE '%INNER JOIN public.user_employee_links uel%' AS has_advisor_join,
       pg_get_functiondef(p.oid) LIKE '%upper(btrim(r.dealer_code)) = ANY (md.codes)%'
         AND pg_get_functiondef(p.oid) LIKE '%service_reception_entry_in_summary_scope%'
         AS broad_path_dealer_prefilter
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('list_reception_entries_page', 'list_reception_reg_created_since')
ORDER BY p.proname;

SELECT pg_get_functiondef(p.oid) LIKE '%v_row_limit constant integer := 10000%' AS reg_since_has_row_cap
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_reception_reg_created_since';
