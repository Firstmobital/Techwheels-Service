-- Sync bodyshop_floor_work module for every logged-in user whose Employee Master role is floor work staff.
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
    AND l.is_primary = true
    AND em.is_active = true
    AND (
      upper(coalesce(em.role, '')) LIKE '%DENTOR%'
      OR upper(coalesce(em.role, '')) LIKE '%PAINTER%'
      OR upper(coalesce(em.role, '')) LIKE '%TECHNICIAN%'
      OR upper(coalesce(em.role, '')) LIKE '%RUBBING%'
      OR upper(coalesce(em.role, '')) LIKE '%EDP%'
    )
  ON CONFLICT (user_id, module_id) DO UPDATE
  SET can_view = true, can_modify = true;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_bodyshop_floor_work_module_grants() TO service_role;

SELECT public.sync_bodyshop_floor_work_module_grants();
