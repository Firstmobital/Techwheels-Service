-- Post-apply checks for
-- supabase/migrations/20260918133000_fix_floor_incharge_scope_ignore_dealer_prefix.sql

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'normalize_employee_fuel_bucket',
    'normalize_employee_location_key',
    'service_floor_incharge_sa_in_scope',
    'user_has_service_floor_incharge_scope_for_sa_code',
    'list_reception_entries_page',
    'list_reception_reg_created_since'
  )
ORDER BY 1, 2;

SELECT
  p.proname,
  pg_get_functiondef(p.oid) LIKE '%service_floor_incharge_sa_in_scope%' AS uses_fuel_location_scope,
  pg_get_functiondef(p.oid) NOT LIKE '%array_length(v_dealer_codes, 1), 0) = 0%' AS drops_fi_dealer_code_gate,
  pg_get_functiondef(p.oid) LIKE '%v_linked_service_floor_fi_only%' AS keeps_service_fi_only_gate
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('list_reception_entries_page', 'list_reception_reg_created_since')
ORDER BY 1;

-- Expect uses_fuel_location_scope, drops_fi_dealer_code_gate, keeps_service_fi_only_gate all true.

SELECT
  public.normalize_employee_fuel_bucket('EV') = 'EV' AS ev_plain,
  public.normalize_employee_fuel_bucket('electric') = 'EV' AS ev_electric,
  public.normalize_employee_fuel_bucket('PV') = 'PV' AS pv_plain,
  public.normalize_employee_location_key('Sitapura') = 'SITAPURA' AS sitapura,
  public.normalize_employee_location_key('Ajmer Road') = 'AJMER ROAD' AS ajmer;
