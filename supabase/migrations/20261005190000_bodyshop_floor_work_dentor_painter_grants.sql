-- Ensure denter / painter (and helpers) get bodyshop_floor_work modify so daily logs + photos pass RLS.

CREATE OR REPLACE FUNCTION public.sync_bodyshop_floor_work_module_grants()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  INSERT INTO public.user_module_permissions (user_id, module_id, can_view, can_modify, can_delete)
  SELECT DISTINCT l.user_id, m.id, true, true, false
  FROM public.user_employee_links l
  JOIN public.employee_master em
    ON upper(trim(em.employee_code)) = upper(trim(l.employee_code))
  JOIN public.modules m ON m.name = 'bodyshop_floor_work' AND m.is_active = true
  WHERE l.is_active = true
    AND em.is_active = true
    AND (
      public.employee_has_business_role(em.role, 'DENTOR')
      OR public.employee_has_business_role(em.role, 'DENTOR_HELPER')
      OR public.employee_has_business_role(em.role, 'PAINTER')
      OR public.employee_has_business_role(em.role, 'PAINTER_HELPER')
      OR public.employee_has_business_role(em.role, 'TECHNICIAN')
      OR public.employee_has_business_role(em.role, 'RUBBING')
      OR public.employee_has_business_role(em.role, 'EDP')
    )
  ON CONFLICT (user_id, module_id) DO UPDATE
  SET can_view = true, can_modify = true;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

SELECT public.sync_bodyshop_floor_work_module_grants();
