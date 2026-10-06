-- Bodyshop floor incharge (linked employee): assign/reassign roles on bodyshop_assignments
-- without requiring bodyshop_floor module modify grant.

CREATE OR REPLACE FUNCTION public.user_is_linked_bodyshop_floor_incharge()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.get_my_bodyshop_employee_scope() s
    WHERE upper(replace(btrim(coalesce(s.department, '')), ' ', '')) LIKE '%BODY%'
      AND public.employee_has_business_role(s.role, 'FLOOR_INCHARGE')
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_is_linked_bodyshop_floor_incharge() TO authenticated;

DROP POLICY IF EXISTS bodyshop_assignments_insert_rbac_v2 ON public.bodyshop_assignments;
CREATE POLICY bodyshop_assignments_insert_rbac_v2 ON public.bodyshop_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.dealer_code_in_scope(dealer_code)
      AND (
        public.has_module_modify('bodyshop_floor')
        OR public.has_module_modify('bodyshop_repair')
        OR public.user_is_linked_bodyshop_floor_incharge()
      )
    )
  );

DROP POLICY IF EXISTS bodyshop_assignments_update_rbac_v2 ON public.bodyshop_assignments;
CREATE POLICY bodyshop_assignments_update_rbac_v2 ON public.bodyshop_assignments
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (
      public.dealer_code_in_scope(dealer_code)
      AND (
        public.has_module_modify('bodyshop_floor')
        OR public.has_module_modify('bodyshop_repair')
        OR public.user_is_linked_bodyshop_floor_incharge()
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.dealer_code_in_scope(dealer_code)
      AND (
        public.has_module_modify('bodyshop_floor')
        OR public.has_module_modify('bodyshop_repair')
        OR public.user_is_linked_bodyshop_floor_incharge()
      )
    )
  );

-- Module grants: bodyshop floor incharge → bodyshop_floor (view+modify) + bodyshop_floor_work (view+modify)
INSERT INTO public.user_module_permissions (user_id, module_id, can_view, can_modify, can_delete)
SELECT DISTINCT l.user_id, m.id, true, true, false
FROM public.user_employee_links l
JOIN public.employee_master em
  ON upper(trim(em.employee_code)) = upper(trim(l.employee_code))
JOIN public.modules m ON m.name = 'bodyshop_floor' AND m.is_active = true
WHERE l.is_active = true
  AND em.is_active = true
  AND upper(replace(btrim(coalesce(em.department, '')), ' ', '')) LIKE '%BODY%'
  AND public.employee_has_business_role(em.role, 'FLOOR_INCHARGE')
ON CONFLICT (user_id, module_id) DO UPDATE
SET can_view = true, can_modify = true;

INSERT INTO public.user_module_permissions (user_id, module_id, can_view, can_modify, can_delete)
SELECT DISTINCT l.user_id, m.id, true, true, false
FROM public.user_employee_links l
JOIN public.employee_master em
  ON upper(trim(em.employee_code)) = upper(trim(l.employee_code))
JOIN public.modules m ON m.name = 'bodyshop_floor_work' AND m.is_active = true
WHERE l.is_active = true
  AND em.is_active = true
  AND upper(replace(btrim(coalesce(em.department, '')), ' ', '')) LIKE '%BODY%'
  AND public.employee_has_business_role(em.role, 'FLOOR_INCHARGE')
ON CONFLICT (user_id, module_id) DO UPDATE
SET can_view = true, can_modify = true;

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
      OR (
        upper(replace(btrim(coalesce(em.department, '')), ' ', '')) LIKE '%BODY%'
        AND public.employee_has_business_role(em.role, 'FLOOR_INCHARGE')
      )
    )
  ON CONFLICT (user_id, module_id) DO UPDATE
  SET can_view = true, can_modify = true;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
