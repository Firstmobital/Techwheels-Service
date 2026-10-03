-- Platform admins (admin module) can read floor work daily logs — matches photo access in 20261003170000.

DROP POLICY IF EXISTS bodyshop_floor_role_daily_logs_select ON public.bodyshop_floor_role_daily_logs;

CREATE POLICY bodyshop_floor_role_daily_logs_select
  ON public.bodyshop_floor_role_daily_logs
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.has_module_view('admin')
    OR public.has_module_modify('admin')
    OR (
      public.dealer_code_in_scope(dealer_code)
      AND (
        public.has_module_view('bodyshop_floor_work')
        OR public.has_module_modify('bodyshop_floor_work')
        OR public.has_module_view('bodyshop_floor')
        OR public.has_module_modify('bodyshop_floor')
      )
    )
  );
