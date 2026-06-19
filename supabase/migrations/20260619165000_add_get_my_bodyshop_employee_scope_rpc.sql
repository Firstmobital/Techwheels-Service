-- RBAC hardening: resolve current user's employee scope through SECURITY DEFINER RPC.
-- This removes frontend dependency on direct employee_master reads for role detection.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_bodyshop_employee_scope()
RETURNS TABLE (
  employee_code text,
  department text,
  role text,
  location text,
  fuel_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    uel.employee_code,
    em.department,
    em.role,
    em.location,
    em.fuel_type
  FROM public.user_employee_links uel
  JOIN public.employee_master em
    ON em.employee_code = uel.employee_code
  WHERE uel.user_id = auth.uid()
    AND uel.is_active = true
    AND uel.dealer_code = public.my_dealer_code();
$$;

COMMENT ON FUNCTION public.get_my_bodyshop_employee_scope() IS
  'Returns the current authenticated user''s active linked employee scope (employee_master-backed) for frontend RBAC role resolution.';

GRANT EXECUTE ON FUNCTION public.get_my_bodyshop_employee_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_bodyshop_employee_scope() TO service_role;

COMMIT;
