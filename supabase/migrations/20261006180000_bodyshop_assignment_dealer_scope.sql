-- Floor incharge could not see assignments saved with branch name (Sitapura)
-- as dealer_code. Admin bypasses RLS, so status counts diverged.

CREATE OR REPLACE FUNCTION public.bodyshop_job_card_in_dealer_scope(p_job_card_number text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bodyshop_repair_cards c
    WHERE upper(btrim(c.job_card_no)) = upper(btrim(coalesce(p_job_card_number, '')))
      AND (
        public.dealer_code_in_scope(split_part(coalesce(c.sa_employee_code, ''), '_', 1))
        OR public.dealer_code_in_scope(split_part(coalesce(c.sa_employee_code, ''), '_', 2))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.bodyshop_job_card_in_dealer_scope(text) TO authenticated;

UPDATE public.bodyshop_assignments a
SET dealer_code = '3000840'
WHERE btrim(a.dealer_code) = 'Sitapura'
  AND EXISTS (
    SELECT 1
    FROM public.bodyshop_repair_cards c
    WHERE upper(btrim(c.job_card_no)) = upper(btrim(a.job_card_number))
      AND upper(coalesce(c.sa_employee_code, '')) LIKE '%3000840%'
  );

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
        OR public.user_is_linked_bodyshop_floor_incharge()
      )
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
    public.is_admin()
    OR (
      (
        public.has_module_modify('bodyshop_floor')
        OR public.has_module_modify('bodyshop_repair')
        OR public.user_is_linked_bodyshop_floor_incharge()
      )
      AND (
        public.dealer_code_in_scope(dealer_code)
        OR public.bodyshop_job_card_in_dealer_scope(job_card_number)
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      (
        public.has_module_modify('bodyshop_floor')
        OR public.has_module_modify('bodyshop_repair')
        OR public.user_is_linked_bodyshop_floor_incharge()
      )
      AND public.dealer_code_in_scope(dealer_code)
    )
  );
