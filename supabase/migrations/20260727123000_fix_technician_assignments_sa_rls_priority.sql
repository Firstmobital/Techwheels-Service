-- Fix /technician tracker timeouts for users with service_advisor + floor_incharge/sa_tracker.
--
-- Problem: technician_assignments_select_sa_own_jobs used
--   CASE WHEN has_module_view('service_advisor') THEN user_sa_owns_job_card_number(...)
--        ELSE has_module_view('floor_incharge')
-- so ANY user with service_advisor module hit user_sa_owns_job_card_number once per
-- assignment row — even when floor_incharge/sa_tracker policies should grant broad read.
--
-- Also: sa_tracker was missing from technician_assignments_select_rbac, so sa_tracker
-- users with service_advisor only matched the expensive SA branch.

-- ── 1) Broad read: admin, floor incharge, SA tracker ─────────────────────────

DROP POLICY IF EXISTS technician_assignments_select_rbac ON public.technician_assignments;

CREATE POLICY technician_assignments_select_rbac
  ON public.technician_assignments
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.has_module_view('floor_incharge'::text)
    OR public.has_module_view('sa_tracker'::text)
  );

-- ── 2) SA-only narrow read: own job cards, not when broad modules already apply ─

DROP POLICY IF EXISTS technician_assignments_select_sa_own_jobs ON public.technician_assignments;

CREATE POLICY technician_assignments_select_sa_own_jobs
  ON public.technician_assignments
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.has_module_view('service_advisor'::text)
      AND NOT public.has_module_view('floor_incharge'::text)
      AND NOT public.has_module_view('sa_tracker'::text)
      AND public.user_sa_owns_job_card_number(job_card_number)
    )
  );

COMMENT ON POLICY technician_assignments_select_sa_own_jobs ON public.technician_assignments IS
  'SA-scoped technician assignment read. Skipped when caller has floor_incharge or sa_tracker (broad read via technician_assignments_select_rbac).';
