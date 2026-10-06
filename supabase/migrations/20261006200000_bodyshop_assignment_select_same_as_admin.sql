-- Floor incharge could open the same bodyshop floor cards as admin, but
-- assignment SELECT still required dealer_code_in_scope. When that failed,
-- every role looked empty (0 cars) while admin still saw the assignments.

DROP POLICY IF EXISTS bodyshop_assignments_select_rbac_v2 ON public.bodyshop_assignments;

CREATE POLICY bodyshop_assignments_select_rbac_v2
  ON public.bodyshop_assignments
  FOR SELECT
  TO authenticated
  USING (
    public.bodyshop_floor_full_editor()
    OR (
      (
        public.has_module_view('bodyshop_floor')
        OR public.has_module_modify('bodyshop_floor')
        OR public.has_module_view('bodyshop_repair')
        OR public.has_module_modify('bodyshop_repair')
        OR public.has_module_view('bodyshop_tracker')
        OR public.has_module_view('bodyshop_floor_work')
        OR public.has_module_modify('bodyshop_floor_work')
        OR public.user_is_linked_bodyshop_floor_incharge()
      )
      AND (
        public.dealer_code_in_scope(dealer_code)
        OR public.bodyshop_job_card_in_dealer_scope(job_card_number)
      )
    )
  );
