-- Fix /technician tracker load failures (statement timeout → aborted txn → 25P02 on pool reuse).
--
-- Fresh schema audit (supabase/backups/full_metadata.sql, 2026-07-21):
--   • Revert 20260718190000 is applied: NO service_reception_select_bodyshop_card_sa_v1 (42P17 risk).
--   • technician_assignments_select_sa_own_jobs still embeds EXISTS (SELECT … service_reception_entries)
--     evaluated as invoker RLS once per assignment row when loading vw_technician_income_assignments.
--   • is_admin() only matched role = 'admin', not 'super_admin' (app + other policies use both).
--
-- This migration does NOT add cross-table RLS between service_reception_entries and bodyshop_repair_cards.
-- For bodyshop SA intake reads, apply 20260718200000_bodyshop_reception_sa_intake_read_safe.sql separately.

-- ── 1) Platform admin: align with app RBAC and sa_earnings_settings policies ────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND is_active = true
      AND role = ANY (ARRAY['admin'::text, 'super_admin'::text])
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'Platform admin gate: active users with role admin or super_admin.';

-- ── 2) SA job-card ownership check without nested reception RLS per technician row ─────────────

CREATE OR REPLACE FUNCTION public.user_sa_owns_job_card_number(p_job_card_number text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    coalesce(btrim(p_job_card_number), '') <> ''
    AND public.my_sa_employee_code() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.service_reception_entries sre
      WHERE upper(btrim(coalesce(sre.jc_number, ''))) = upper(btrim(p_job_card_number))
        AND sre.sa_employee_code IS NOT NULL
        AND upper(btrim(sre.sa_employee_code)) = upper(btrim(public.my_sa_employee_code()))
    );
$$;

COMMENT ON FUNCTION public.user_sa_owns_job_card_number(text) IS
  'True when the caller''s primary linked SA code matches sa_employee_code on a reception row for the job card. SECURITY DEFINER: avoids evaluating all service_reception_entries RLS policies once per technician_assignments row (tracker scale).';

GRANT EXECUTE ON FUNCTION public.user_sa_owns_job_card_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_sa_owns_job_card_number(text) TO service_role;

DROP POLICY IF EXISTS technician_assignments_select_sa_own_jobs ON public.technician_assignments;

CREATE POLICY technician_assignments_select_sa_own_jobs
  ON public.technician_assignments
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR CASE
      WHEN public.has_module_view('service_advisor'::text)
        THEN public.user_sa_owns_job_card_number(job_card_number)
      ELSE public.has_module_view('floor_incharge'::text)
    END
  );
