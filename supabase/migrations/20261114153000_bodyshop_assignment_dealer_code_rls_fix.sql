-- Assign UPDATE could pass USING via job_card scope but fail WITH CHECK on stored
-- dealer_code (e.g. reception prefix GJ1 while user scope is 3000840).

DROP POLICY IF EXISTS bodyshop_assignments_insert_rbac_v2 ON public.bodyshop_assignments;
CREATE POLICY bodyshop_assignments_insert_rbac_v2 ON public.bodyshop_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.bodyshop_floor_full_editor()
    OR (
      public.has_module_modify('bodyshop_repair')
      AND (
        public.dealer_code_in_scope(dealer_code)
        OR public.bodyshop_job_card_in_dealer_scope(job_card_number)
      )
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
      AND (
        public.dealer_code_in_scope(dealer_code)
        OR public.bodyshop_job_card_in_dealer_scope(job_card_number)
      )
    )
  );

UPDATE public.bodyshop_assignments AS a
SET dealer_code = btrim(split_part(c.sa_employee_code, '_', 2))
FROM public.bodyshop_repair_cards AS c
WHERE upper(btrim(c.job_card_no)) = upper(btrim(a.job_card_number))
  AND btrim(coalesce(c.sa_employee_code, '')) LIKE '%\_%'
  AND btrim(split_part(c.sa_employee_code, '_', 2)) ~ '^\d+$'
  AND (
    upper(btrim(a.dealer_code)) = upper(btrim(split_part(c.sa_employee_code, '_', 1)))
    OR btrim(a.dealer_code) !~ '^\d+$'
  );

UPDATE public.bodyshop_assignments AS a
SET reception_entry_id = c.reception_entry_id
FROM public.bodyshop_repair_cards AS c
WHERE a.repair_card_id = c.id
  AND a.reception_entry_id IS NULL
  AND c.reception_entry_id IS NOT NULL;