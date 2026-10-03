-- Platform admins (admin module) can read repair cards for reg/customer on Floor Work overview.

DROP POLICY IF EXISTS bodyshop_repair_cards_select_rbac_v2 ON public.bodyshop_repair_cards;

CREATE POLICY bodyshop_repair_cards_select_rbac_v2 ON public.bodyshop_repair_cards
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.has_module_view('admin')
    OR public.has_module_modify('admin')
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
