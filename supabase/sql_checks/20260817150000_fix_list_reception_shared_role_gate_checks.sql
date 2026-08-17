-- Post-apply checks for 20260817150000_fix_list_reception_shared_role_gate.sql

SELECT p.proname, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('list_reception_entries_page', 'list_reception_reg_created_since')
ORDER BY p.proname;

SELECT p.proname,
       pg_get_functiondef(p.oid) LIKE '%v_use_advisor_own_codes%' AS uses_advisor_own_codes_gate,
       pg_get_functiondef(p.oid) LIKE '%has_module_view(''service_advisor''%' AS requires_sa_module,
       pg_get_functiondef(p.oid) LIKE '%has_module_view(''bodyshop_floor''%' AS excludes_bodyshop_floor,
       pg_get_functiondef(p.oid) LIKE '%has_module_view(''floor_incharge''%' AS excludes_floor_incharge,
       pg_get_functiondef(p.oid) LIKE '%dealer_code)) = ANY (md.codes)%' AS keeps_dealer_prefilter
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('list_reception_entries_page', 'list_reception_reg_created_since')
ORDER BY p.proname;
