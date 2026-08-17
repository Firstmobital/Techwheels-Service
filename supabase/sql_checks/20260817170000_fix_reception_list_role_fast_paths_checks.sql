-- Post-apply checks for 20260817170000_fix_reception_list_role_fast_paths.sql

SELECT p.proname, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('list_reception_entries_page', 'list_reception_reg_created_since')
ORDER BY p.proname;

SELECT p.proname,
       pg_get_functiondef(p.oid) LIKE '%v_reception_dealer_only%' AS has_reception_dealer_gate,
       pg_get_functiondef(p.oid) LIKE '%v_use_floor_incharge_scope%' AS has_floor_fast_path,
       pg_get_functiondef(p.oid) LIKE '%allowed_sa AS MATERIALIZED%' AS floor_precomputes_sa_codes,
       pg_get_functiondef(p.oid) LIKE '%IF v_is_admin THEN%' AS has_admin_fast_path,
       pg_get_functiondef(p.oid) LIKE '%v_use_advisor_own_codes%' AS keeps_advisor_own_codes_gate,
       pg_get_functiondef(p.oid) NOT LIKE '%scope_mode AS (%' AS dropped_legacy_scope_mode_cte
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('list_reception_entries_page', 'list_reception_reg_created_since')
ORDER BY p.proname;
