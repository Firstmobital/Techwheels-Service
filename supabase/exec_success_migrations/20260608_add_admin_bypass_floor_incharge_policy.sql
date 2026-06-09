-- 2026-06-08
-- Audit Source: local_folder/backups/chunks/full_database.sql.part_002 (Authoritative)
-- Purpose: Add admin bypass to ALL role-specific RLS policies missing it
-- Issue: Role-specific SELECT policies require explicit module permissions that
--        admin users don't always have. Admin bypass ensures admin users can
--        access all screens for testing, debugging, and administration.
--
-- Verified Policies (from authoritative dump):
-- 1. service_reception_select_floor_incharge (line 21147) — ❌ Missing admin bypass
-- 2. service_reception_select_crm_dealer_scope (line 21130) — ❌ Missing admin bypass
-- 3. technician_assignments_select_rbac (line 21259) — ❌ Missing admin bypass
-- 4. technician_assignments_insert_rbac (line 21251) — ❌ Missing admin bypass
-- 5. technician_assignments_update_rbac (line 21289) — ❌ Missing admin bypass
-- 6. technician_assignments_delete_rbac (line 21243) — ❌ Missing admin bypass
-- 7. technician_assignments_select_sa_own_jobs (line 21267) — ❌ Missing admin bypass
-- 8. technician_assignments_select_technician (line 21281) — ❌ Missing admin bypass

-- Note: admin_unrestricted_all_ops_v1 policies already exist on both tables
-- with full admin bypass for CRUD, but role-specific SELECT policies lack
-- explicit admin bypass for clarity and consistency.

-- 1. Service Reception: Floor Incharge scope
DROP POLICY IF EXISTS service_reception_select_floor_incharge ON public.service_reception_entries;

CREATE POLICY service_reception_select_floor_incharge ON public.service_reception_entries
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('floor_incharge'::text)
    AND (sa_employee_code IS NOT NULL)
    AND public.user_has_floor_incharge_scope_for_sa_code(sa_employee_code)
  )
);

-- 2. Service Reception: CRM dealer scope
DROP POLICY IF EXISTS service_reception_select_crm_dealer_scope ON public.service_reception_entries;

CREATE POLICY service_reception_select_crm_dealer_scope ON public.service_reception_entries
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('service_advisor'::text)
    AND (sa_employee_code IS NOT NULL)
    AND public.user_is_crm_for_dealer_sa(sa_employee_code)
  )
);

-- 3. Technician Assignments: SELECT (floor_incharge)
DROP POLICY IF EXISTS technician_assignments_select_rbac ON public.technician_assignments;

CREATE POLICY technician_assignments_select_rbac ON public.technician_assignments
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR public.has_module_view('floor_incharge'::text)
);

-- 4. Technician Assignments: INSERT (floor_incharge)
DROP POLICY IF EXISTS technician_assignments_insert_rbac ON public.technician_assignments;

CREATE POLICY technician_assignments_insert_rbac ON public.technician_assignments
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  OR public.has_module_modify('floor_incharge'::text)
);

-- 5. Technician Assignments: UPDATE (floor_incharge)
DROP POLICY IF EXISTS technician_assignments_update_rbac ON public.technician_assignments;

CREATE POLICY technician_assignments_update_rbac ON public.technician_assignments
FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR public.has_module_modify('floor_incharge'::text)
)
WITH CHECK (
  public.is_admin()
  OR public.has_module_modify('floor_incharge'::text)
);

-- 6. Technician Assignments: DELETE (floor_incharge)
DROP POLICY IF EXISTS technician_assignments_delete_rbac ON public.technician_assignments;

CREATE POLICY technician_assignments_delete_rbac ON public.technician_assignments
FOR DELETE TO authenticated
USING (
  public.is_admin()
  OR public.has_module_delete('floor_incharge'::text)
);

-- 7. Technician Assignments: SELECT (Service Advisor view own jobs)
DROP POLICY IF EXISTS technician_assignments_select_sa_own_jobs ON public.technician_assignments;

CREATE POLICY technician_assignments_select_sa_own_jobs ON public.technician_assignments
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR CASE
    WHEN public.has_module_view('service_advisor'::text) THEN
      EXISTS (
        SELECT 1 FROM public.service_reception_entries sre
        WHERE (sre.jc_number = job_card_number)
          AND (sre.sa_employee_code = public.my_sa_employee_code())
      )
    ELSE public.has_module_view('floor_incharge'::text)
  END
);

-- 8. Technician Assignments: SELECT (Technician self-view)
DROP POLICY IF EXISTS technician_assignments_select_technician ON public.technician_assignments;

CREATE POLICY technician_assignments_select_technician ON public.technician_assignments
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('technician'::text)
    AND public.user_has_technician_code(technician_code)
  )
);
