-- Migration: Make Service Advisor visibility dealer-agnostic
-- Purpose:
-- 1) Reception entries may be created by staff in one dealer context and later assigned to SA from another dealer code.
-- 2) SA visibility should be governed by sa_employee_code mapping only, not creator dealer context.
-- Date: 2026-06-01

BEGIN;

-- Update helper to check employee-code membership without dealer_code constraint.
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
      AND uel.employee_code = p_employee_code
  );
$$;

COMMENT ON FUNCTION public.user_has_employee_code(text) IS
  'Returns true if current authenticated user has an active mapping to p_employee_code (dealer-agnostic).';

-- Replace SA policies to use employee-code mapping only.
DROP POLICY IF EXISTS service_reception_select_sa ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_update_sa ON public.service_reception_entries;

CREATE POLICY service_reception_select_sa ON public.service_reception_entries
  FOR SELECT TO authenticated
  USING (
    public.has_module_view('service_advisor')
    AND public.user_has_employee_code(sa_employee_code)
  );

CREATE POLICY service_reception_update_sa ON public.service_reception_entries
  FOR UPDATE TO authenticated
  USING (
    public.has_module_modify('service_advisor')
    AND public.user_has_employee_code(sa_employee_code)
  )
  WITH CHECK (
    public.has_module_modify('service_advisor')
    AND public.user_has_employee_code(sa_employee_code)
  );

COMMIT;
