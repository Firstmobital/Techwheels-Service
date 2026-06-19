BEGIN;

-- Harden surveyor dropdown visibility for bodyshop execution roles.
-- This keeps existing module-based access and additionally allows
-- SA/SSA/SURVEY users mapped through user_employee_links + employee_master.
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v1 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v2 ON public.settings_bodyshop_surveyors;

CREATE POLICY settings_bodyshop_surveyors_select_v3 ON public.settings_bodyshop_surveyors
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    public.dealer_code_in_scope(dealer_code)
    AND (
      public.has_module_view('settings'::text)
      OR public.has_module_view('bodyshop_repair'::text)
      OR public.has_module_modify('bodyshop_repair'::text)
      OR EXISTS (
        SELECT 1
        FROM public.user_employee_links uel
        JOIN public.employee_master em
          ON em.employee_code = uel.employee_code
        WHERE uel.user_id = auth.uid()
          AND uel.is_active = true
          AND uel.dealer_code = settings_bodyshop_surveyors.dealer_code
          AND UPPER(COALESCE(em.department, '')) = 'BODYSHOP'
          AND UPPER(COALESCE(em.role, '')) IN ('SA', 'SSA', 'SURVEY')
      )
    )
  )
);

COMMIT;
