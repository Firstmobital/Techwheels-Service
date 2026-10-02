-- Floor Work workers (denter/painter/etc.) need to READ assignments/cards and WRITE daily logs.

DROP POLICY IF EXISTS bodyshop_assignments_select_rbac_v2 ON public.bodyshop_assignments;
CREATE POLICY bodyshop_assignments_select_rbac_v2 ON public.bodyshop_assignments
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      (
        public.has_module_view('bodyshop_floor')
        OR public.has_module_modify('bodyshop_floor')
        OR public.has_module_view('bodyshop_repair')
        OR public.has_module_modify('bodyshop_repair')
        OR public.has_module_view('bodyshop_tracker')
        OR public.has_module_view('bodyshop_floor_work')
        OR public.has_module_modify('bodyshop_floor_work')
      )
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

DROP POLICY IF EXISTS bodyshop_repair_cards_select_rbac_v2 ON public.bodyshop_repair_cards;
CREATE POLICY bodyshop_repair_cards_select_rbac_v2 ON public.bodyshop_repair_cards
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
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
    )
  );

-- Grant bodyshop_floor_work to logged-in staff with floor work business roles.
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
