-- Align Service Advisor update behavior with visible-row UX.
-- If a user can view rows in Service Advisor and has service_advisor modify permission,
-- allow Mark Done / row updates for rows visible via either:
-- 1) direct employee-code ownership mapping, or
-- 2) CRM dealer-scope visibility (user_is_crm_for_dealer_sa).

BEGIN;

DROP POLICY IF EXISTS service_reception_update_sa ON public.service_reception_entries;

CREATE POLICY service_reception_update_sa ON public.service_reception_entries
  FOR UPDATE TO authenticated
  USING (
    public.has_module_modify('service_advisor')
    AND sa_employee_code IS NOT NULL
    AND (
      public.user_has_employee_code(sa_employee_code)
      OR public.user_is_crm_for_dealer_sa(sa_employee_code)
    )
  )
  WITH CHECK (
    public.has_module_modify('service_advisor')
    AND sa_employee_code IS NOT NULL
    AND (
      public.user_has_employee_code(sa_employee_code)
      OR public.user_is_crm_for_dealer_sa(sa_employee_code)
    )
  );

COMMIT;
