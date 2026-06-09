-- 2026-06-08
-- Purpose: Tighten reception row visibility so dealer-scope checks cannot bypass
-- SA embedded dealer scope. This aligns reception SELECT with unified all-pages
-- visibility semantics.

BEGIN;

DROP POLICY IF EXISTS service_reception_select_rbac ON public.service_reception_entries;

CREATE POLICY service_reception_select_rbac ON public.service_reception_entries
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('reception'::text)
    AND public.dealer_code_in_scope(dealer_code)
    AND (
      sa_employee_code IS NULL
      OR public.sa_code_in_scope(sa_employee_code)
    )
  )
);

COMMIT;
