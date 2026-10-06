-- Bodyshop floor incharge already has bodyshop_floor modify, but writes still
-- required dealer_code_in_scope on the stored dealer code. Admin skips that
-- check, so the same assign / QC / RI save failed for floor incharge.

CREATE OR REPLACE FUNCTION public.bodyshop_floor_full_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    public.is_admin()
    OR public.has_module_modify('bodyshop_floor')
    OR public.user_is_linked_bodyshop_floor_incharge();
$$;

GRANT EXECUTE ON FUNCTION public.bodyshop_floor_full_editor() TO authenticated;

INSERT INTO public.user_module_permissions (user_id, module_id, can_view, can_modify, can_delete)
SELECT DISTINCT l.user_id, m.id, true, true, false
FROM public.user_employee_links l
JOIN public.employee_master em
  ON upper(trim(em.employee_code)) = upper(trim(l.employee_code))
JOIN public.modules m
  ON m.name IN ('bodyshop_floor', 'bodyshop_floor_work', 'bodyshop_repair')
 AND m.is_active = true
WHERE l.is_active = true
  AND em.is_active = true
  AND upper(replace(btrim(coalesce(em.department, '')), ' ', '')) LIKE '%BODY%'
  AND public.employee_has_business_role(em.role, 'FLOOR_INCHARGE')
ON CONFLICT (user_id, module_id) DO UPDATE
SET can_view = true, can_modify = true;

DROP POLICY IF EXISTS bodyshop_assignments_insert_rbac_v2 ON public.bodyshop_assignments;
CREATE POLICY bodyshop_assignments_insert_rbac_v2 ON public.bodyshop_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.bodyshop_floor_full_editor()
    OR (
      public.has_module_modify('bodyshop_repair')
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

DROP POLICY IF EXISTS bodyshop_assignments_update_rbac_v2 ON public.bodyshop_assignments;
CREATE POLICY bodyshop_assignments_update_rbac_v2 ON public.bodyshop_assignments
  FOR UPDATE TO authenticated
  USING (
    public.bodyshop_floor_full_editor()
    OR (
      public.has_module_modify('bodyshop_repair')
      AND (
        public.dealer_code_in_scope(dealer_code)
        OR public.bodyshop_job_card_in_dealer_scope(job_card_number)
      )
    )
  )
  WITH CHECK (
    public.bodyshop_floor_full_editor()
    OR (
      public.has_module_modify('bodyshop_repair')
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

DROP POLICY IF EXISTS bodyshop_repair_cards_update_rbac_v2 ON public.bodyshop_repair_cards;
CREATE POLICY bodyshop_repair_cards_update_rbac_v2 ON public.bodyshop_repair_cards
  FOR UPDATE TO authenticated
  USING (
    public.bodyshop_floor_full_editor()
    OR (
      (
        public.has_module_modify('service_advisor')
        OR public.has_module_modify('reception')
        OR public.has_module_modify('bodyshop_repair')
      )
      AND (
        (
          reception_entry_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.service_reception_entries sre
            WHERE sre.id = bodyshop_repair_cards.reception_entry_id
              AND public.dealer_code_in_scope(sre.dealer_code)
          )
        )
        OR public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 1))
        OR public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 2))
      )
    )
  )
  WITH CHECK (
    public.bodyshop_floor_full_editor()
    OR (
      (
        public.has_module_modify('service_advisor')
        OR public.has_module_modify('reception')
        OR public.has_module_modify('bodyshop_repair')
      )
      AND (
        (
          reception_entry_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.service_reception_entries sre
            WHERE sre.id = bodyshop_repair_cards.reception_entry_id
              AND public.dealer_code_in_scope(sre.dealer_code)
          )
        )
        OR public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 1))
        OR public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 2))
      )
    )
  );
