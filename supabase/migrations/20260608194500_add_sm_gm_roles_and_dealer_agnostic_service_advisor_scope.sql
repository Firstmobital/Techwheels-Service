-- 2026-06-08
-- Purpose: Extend existing Service Advisor policy family so SM/GM users are
--          dealer-agnostic (all dealer codes) while still honoring module
--          view/modify rights.
-- Audit source: local_folder/backups/chunks/full_database.sql.part_000/.part_002
-- Safety: modifies only existing service_reception_entries policy names.

BEGIN;

-- 1) Extend existing CRM dealer-scope SELECT policy with SM/GM dealer-agnostic scope.
--    Existing policy name is preserved: service_reception_select_crm_dealer_scope
DROP POLICY IF EXISTS service_reception_select_crm_dealer_scope ON public.service_reception_entries;

CREATE POLICY service_reception_select_crm_dealer_scope ON public.service_reception_entries
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('service_advisor'::text)
    AND sa_employee_code IS NOT NULL
    AND (
      public.user_is_crm_for_dealer_sa(sa_employee_code)
      OR EXISTS (
        SELECT 1
        FROM public.user_employee_links uel
        JOIN public.employee_master em
          ON em.employee_code = uel.employee_code
        WHERE uel.user_id = auth.uid()
          AND uel.is_active = true
          AND lower(btrim(coalesce(em.role, ''))) = ANY (ARRAY['sm', 'gm'])
      )
    )
  )
);

-- 2) Keep UPDATE scope aligned with visible-row semantics for Service Advisor module.
--    Existing policy name is preserved: service_reception_update_sa
DROP POLICY IF EXISTS service_reception_update_sa ON public.service_reception_entries;

CREATE POLICY service_reception_update_sa ON public.service_reception_entries
FOR UPDATE TO authenticated
USING (
  public.has_module_modify('service_advisor'::text)
  AND sa_employee_code IS NOT NULL
  AND (
    public.user_has_employee_code(sa_employee_code)
    OR public.user_is_crm_for_dealer_sa(sa_employee_code)
    OR EXISTS (
      SELECT 1
      FROM public.user_employee_links uel
      JOIN public.employee_master em
        ON em.employee_code = uel.employee_code
      WHERE uel.user_id = auth.uid()
        AND uel.is_active = true
        AND lower(btrim(coalesce(em.role, ''))) = ANY (ARRAY['sm', 'gm'])
    )
  )
)
WITH CHECK (
  public.has_module_modify('service_advisor'::text)
  AND sa_employee_code IS NOT NULL
  AND (
    public.user_has_employee_code(sa_employee_code)
    OR public.user_is_crm_for_dealer_sa(sa_employee_code)
    OR EXISTS (
      SELECT 1
      FROM public.user_employee_links uel
      JOIN public.employee_master em
        ON em.employee_code = uel.employee_code
      WHERE uel.user_id = auth.uid()
        AND uel.is_active = true
        AND lower(btrim(coalesce(em.role, ''))) = ANY (ARRAY['sm', 'gm'])
    )
  )
);

COMMIT;
