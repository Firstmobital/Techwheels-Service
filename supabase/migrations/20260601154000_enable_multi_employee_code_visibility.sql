-- Migration: Enable multi-employee-code visibility for one signed-in user
-- Purpose:
-- 1) Allow one user to own rows for multiple employee codes under same dealer context.
-- 2) Keep existing primary mapping behavior for defaults, but RLS checks all active mappings.
-- Date: 2026-06-01

BEGIN;

-- Helper: true when current user is actively mapped to the given employee_code for current dealer.
CREATE OR REPLACE FUNCTION public.user_has_employee_code(p_employee_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_employee_links uel
    WHERE uel.user_id = auth.uid()
      AND uel.is_active = true
      AND uel.dealer_code = public.my_dealer_code()
      AND uel.employee_code = p_employee_code
  );
$$;

COMMENT ON FUNCTION public.user_has_employee_code(text) IS
  'Returns true if current authenticated user has an active mapping to p_employee_code for current dealer.';

-- Replace SA policies from single-code (= my_sa_employee_code()) to multi-code membership checks.
DROP POLICY IF EXISTS service_reception_select_sa ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_update_sa ON public.service_reception_entries;

CREATE POLICY service_reception_select_sa ON public.service_reception_entries
  FOR SELECT TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND public.has_module_view('service_advisor')
    AND public.user_has_employee_code(sa_employee_code)
  );

CREATE POLICY service_reception_update_sa ON public.service_reception_entries
  FOR UPDATE TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND public.has_module_modify('service_advisor')
    AND public.user_has_employee_code(sa_employee_code)
  )
  WITH CHECK (
    dealer_code = public.my_dealer_code()
    AND public.has_module_modify('service_advisor')
    AND public.user_has_employee_code(sa_employee_code)
  );

COMMIT;
