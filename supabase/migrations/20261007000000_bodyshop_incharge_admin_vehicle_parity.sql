-- Floor incharge saw fewer vehicles than admin (Floor Work worker view + repair-card read gaps).

CREATE OR REPLACE FUNCTION public.normalize_bodyshop_physical_floor(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN upper(btrim(coalesce(p_raw, ''))) IN ('FLOOR 2', 'FLOOR2', 'F2') THEN 'Floor 2'
    WHEN upper(btrim(coalesce(p_raw, ''))) IN ('FLOOR 3', 'FLOOR3', 'F3') THEN 'Floor 3'
    WHEN btrim(coalesce(p_raw, '')) IN ('Floor 2', 'Floor 3') THEN btrim(p_raw)
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.my_bodyshop_physical_floor()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.normalize_bodyshop_physical_floor(
    coalesce(
      nullif(btrim(em.fuel_type), ''),
      nullif(btrim(em.location), '')
    )
  )
  FROM public.user_employee_links uel
  JOIN public.employee_master em ON em.employee_code = uel.employee_code
  WHERE uel.user_id = auth.uid()
    AND uel.is_active = true
    AND public.employee_has_business_role(em.role, 'FLOOR_INCHARGE')
    AND upper(replace(btrim(coalesce(em.department, '')), ' ', '')) LIKE '%BODY%'
  ORDER BY uel.is_primary DESC, uel.updated_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_is_bodyshop_physical_floor_incharge()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.my_bodyshop_physical_floor() IS NOT NULL
    AND (
      public.has_module_view('bodyshop_floor')
      OR public.has_module_modify('bodyshop_floor')
    )
    AND NOT public.is_admin()
    AND NOT public.has_module_view('admin')
    AND NOT public.has_module_modify('admin');
$$;

GRANT EXECUTE ON FUNCTION public.normalize_bodyshop_physical_floor(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_bodyshop_physical_floor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_bodyshop_physical_floor_incharge() TO authenticated;

DROP POLICY IF EXISTS bodyshop_repair_cards_select_rbac_v2 ON public.bodyshop_repair_cards;

CREATE POLICY bodyshop_repair_cards_select_rbac_v2 ON public.bodyshop_repair_cards
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.has_module_view('admin')
    OR public.has_module_modify('admin')
    OR (
      public.bodyshop_floor_full_editor()
      AND (
        (
          reception_entry_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.service_reception_entries sre
            WHERE sre.id = bodyshop_repair_cards.reception_entry_id
              AND public.dealer_code_in_scope(sre.dealer_code)
          )
        )
        OR public.dealer_code_in_scope(split_part(COALESCE(sa_employee_code, ''), '_', 1))
        OR public.dealer_code_in_scope(split_part(COALESCE(sa_employee_code, ''), '_', 2))
      )
    )
    OR (
      (
        public.has_module_view('service_advisor')
        OR public.has_module_view('reception')
        OR public.has_module_view('bodyshop_floor')
        OR public.has_module_view('bodyshop_repair')
        OR public.has_module_view('bodyshop_tracker')
        OR public.has_module_view('bodyshop_floor_work')
        OR public.has_module_modify('bodyshop_floor_work')
      )
      AND (
        (
          reception_entry_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.service_reception_entries sre
            WHERE sre.id = bodyshop_repair_cards.reception_entry_id
              AND public.dealer_code_in_scope(sre.dealer_code)
          )
        )
        OR public.dealer_code_in_scope(split_part(COALESCE(sa_employee_code, ''), '_', 1))
        OR public.dealer_code_in_scope(split_part(COALESCE(sa_employee_code, ''), '_', 2))
      )
      AND (
        NOT public.user_is_bodyshop_physical_floor_incharge()
        OR public.normalize_bodyshop_physical_floor(bodyshop_floor) = public.my_bodyshop_physical_floor()
        OR public.normalize_bodyshop_physical_floor(bodyshop_floor) IS NULL
      )
    )
  );
