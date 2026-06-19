BEGIN;

-- Use SECURITY DEFINER scope RPC inside RLS policy so non-admin users do not
-- depend on direct SELECT privileges to employee mapping tables.
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v1 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v2 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v3 ON public.settings_bodyshop_surveyors;

CREATE POLICY settings_bodyshop_surveyors_select_v4 ON public.settings_bodyshop_surveyors
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
        FROM public.get_my_bodyshop_employee_scope() s
        WHERE UPPER(COALESCE(s.department, '')) = 'BODYSHOP'
          AND UPPER(COALESCE(s.role, '')) IN ('SA', 'SSA', 'SURVEY')
      )
    )
  )
);

COMMIT;
