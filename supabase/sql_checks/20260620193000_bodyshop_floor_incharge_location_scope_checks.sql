-- Read-only verification checks for:
-- supabase/migrations/20260620193000_bodyshop_floor_incharge_location_scope.sql

-- 1) Confirm policy exists and has expected predicate shape.
SELECT schemaname, tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'service_reception_entries'
  AND policyname = 'service_reception_select_bodyshop_floor_incharge_v1';

-- 2) Confirm floor-incharge scope helper no longer depends on fuel_type and uses location matching.
SELECT pg_get_functiondef('public.user_has_floor_incharge_scope_for_sa_code(text)'::regprocedure) AS function_ddl;

-- 3) Confirm legacy floor-incharge select policy still keeps admin bypass and uses scope helper.
SELECT schemaname, tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'service_reception_entries'
  AND policyname = 'service_reception_select_floor_incharge';

-- 4) Smoke-check SA codes mentioned in requirement map to expected location labels in employee master.
SELECT employee_code, employee_name, location, department, role, fuel_type
FROM public.employee_master
WHERE upper(employee_code) IN ('3000840', '500A840', '3001440')
ORDER BY employee_code;
