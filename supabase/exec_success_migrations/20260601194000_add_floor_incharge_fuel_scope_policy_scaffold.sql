-- Migration: Add Floor Incharge role + fuel_type scoped row visibility (scaffold)
-- Purpose:
-- 1) Floor Incharge row visibility is independent from reception/service_advisor module gates.
-- 2) A user can see reception rows only when they are mapped as Floor Incharge and
--    their mapped fuel_type matches the SA employee fuel_type on each row.
-- 3) Keep this as SELECT-only policy for now; assignment writes occur in technician_assignments.
-- Date: 2026-06-01

BEGIN;

CREATE OR REPLACE FUNCTION public.user_has_floor_incharge_scope_for_sa_code(p_sa_employee_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_employee_links uel_fi
    JOIN public.employee_master fi
      ON fi.employee_code = uel_fi.employee_code
    JOIN public.employee_master sa
      ON sa.employee_code = p_sa_employee_code
    WHERE uel_fi.user_id = auth.uid()
      AND uel_fi.is_active = true
      AND lower(btrim(coalesce(fi.role, ''))) IN ('floor incharge', 'floor_incharge')
      AND nullif(lower(btrim(coalesce(fi.fuel_type, ''))), '') IS NOT NULL
      AND lower(btrim(coalesce(fi.fuel_type, ''))) = lower(btrim(coalesce(sa.fuel_type, '')))
  );
$$;

COMMENT ON FUNCTION public.user_has_floor_incharge_scope_for_sa_code(text) IS
  'Returns true when authenticated user is mapped as Floor Incharge and fuel_type matches the SA employee code row scope.';

DROP POLICY IF EXISTS service_reception_select_floor_incharge ON public.service_reception_entries;

CREATE POLICY service_reception_select_floor_incharge ON public.service_reception_entries
  FOR SELECT
  TO authenticated
  USING (
    public.has_module_view('floor_incharge')
    AND sa_employee_code IS NOT NULL
    AND public.user_has_floor_incharge_scope_for_sa_code(sa_employee_code)
  );

COMMIT;
