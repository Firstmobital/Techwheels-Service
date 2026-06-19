BEGIN;

-- Allow bodyshop-repair scoped users (including SURVEY role users) to read
-- settings_bodyshop_surveyors for the Survey tab dropdown.
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v1 ON public.settings_bodyshop_surveyors;

CREATE POLICY settings_bodyshop_surveyors_select_v2 ON public.settings_bodyshop_surveyors
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    public.dealer_code_in_scope(dealer_code)
    AND (
      public.has_module_view('settings'::text)
      OR public.has_module_view('bodyshop_repair'::text)
      OR public.has_module_modify('bodyshop_repair'::text)
    )
  )
);

COMMIT;
