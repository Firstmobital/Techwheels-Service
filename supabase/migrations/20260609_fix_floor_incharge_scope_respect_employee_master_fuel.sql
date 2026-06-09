-- Fix: Floor Incharge visibility must follow employee_master fuel scope,
-- not SA employee-code prefix dealer scope.
--
-- Problem:
-- Existing policy required public.sa_code_in_scope(sa_employee_code), which derives
-- scope from SA code fragments (e.g., PS2_3000840). This blocks valid EV/PV floor
-- users when forced fuel_type overrides are applied in employee_master.
--
-- Result:
-- Floor Incharge row visibility now depends on:
-- 1) floor_incharge module view permission
-- 2) user_has_floor_incharge_scope_for_sa_code(sa_employee_code)
--    (role + fuel_type match from employee_master)

BEGIN;

DROP POLICY IF EXISTS service_reception_select_floor_incharge ON public.service_reception_entries;

CREATE POLICY service_reception_select_floor_incharge ON public.service_reception_entries
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('floor_incharge'::text)
    AND sa_employee_code IS NOT NULL
    AND public.user_has_floor_incharge_scope_for_sa_code(sa_employee_code)
  )
);

COMMIT;
