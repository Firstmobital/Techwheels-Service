-- Post-apply checks for 20260818110000_fix_list_reception_service_floor_fi_gate.sql

SELECT p.proname,
       pg_get_functiondef(p.oid) LIKE '%v_linked_service_floor_fi_only%' AS has_service_fi_only_gate,
       pg_get_functiondef(p.oid) LIKE '%NOT v_linked_service_floor_fi_only%' AS advisor_path_excludes_service_fi_only,
       pg_get_functiondef(p.oid) LIKE '%NOT public.has_module_view(''bodyshop_floor''%' AS still_excludes_bodyshop_floor
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('list_reception_entries_page', 'list_reception_reg_created_since')
ORDER BY p.proname;

-- Expect all three flags true for both functions
