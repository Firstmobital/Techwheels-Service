-- Migration: Add Technician module and row-visibility policy for technician users
-- Purpose:
-- 1) Register sidebar module 'technician'.
-- 2) Allow technician users to view only their own technician_assignments rows,
--    based on active user_employee_links mapping and employee role=TECHNICIAN.
-- 3) Technician scope is dealer-agnostic by requirement (multi-dealer mappings allowed).
-- 4) This migration is additive for SELECT scope and does not replace Floor Incharge
--    technician_assignments policies created earlier.
-- Date: 2026-06-01

BEGIN;

CREATE OR REPLACE FUNCTION public.user_has_technician_code(p_technician_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_employee_links uel
    JOIN public.employee_master em
      ON em.employee_code = uel.employee_code
    WHERE uel.user_id = auth.uid()
      AND uel.is_active = true
      AND upper(uel.employee_code) = upper(p_technician_code)
      AND lower(btrim(coalesce(em.role, ''))) = 'technician'
  );
$$;

COMMENT ON FUNCTION public.user_has_technician_code(text) IS
  'Dealer-agnostic check: returns true if authenticated user is actively mapped to given technician employee code and mapped employee role is TECHNICIAN.';

INSERT INTO public.modules (name, label, description, icon, route, sort_order, is_active)
VALUES (
  'technician',
  'Technician',
  'Technician workspace with assigned rows and day-wise income tracking',
  'wrench',
  '/technician',
  13,
  true
)
ON CONFLICT (name) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  route = EXCLUDED.route,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

DROP POLICY IF EXISTS technician_assignments_select_technician ON public.technician_assignments;

-- Add a Technician module SELECT policy. Existing Floor Incharge SELECT policy remains in place.
CREATE POLICY technician_assignments_select_technician ON public.technician_assignments
  FOR SELECT
  TO authenticated
  USING (
    public.has_module_view('technician')
    AND public.user_has_technician_code(technician_code)
  );

COMMIT;
