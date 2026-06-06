-- Migration: Add CRM dealer-scope visibility for Service Advisor module
-- Purpose:
--   Allow users mapped to CRM role to view all service_reception_entries rows
--   for their mapped dealer_code, while preserving existing SA self-row scope.
-- Notes:
--   - This only adds SELECT visibility for CRM scope.
--   - Existing update policy remains employee-code scoped.

CREATE OR REPLACE FUNCTION public.user_is_crm_for_dealer_sa(p_sa_employee_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Returns true if:
  -- 1. Authenticated user has active CRM role, AND
  -- 2. The dealer code embedded in SA employee code matches the CRM user's mapped dealer code
  -- CRM users see all rows from all SAs in their dealer
  -- Handles both formats:
  --   - Numeric first: '500A840_131' -> dealer_code '500A840' (before underscore)
  --   - Text first: 'EPM_500A840' -> dealer_code '500A840' (after underscore)
  SELECT EXISTS (
    SELECT 1
    FROM public.user_employee_links crm_link
    JOIN public.employee_master crm_em
      ON crm_em.employee_code = crm_link.employee_code
    WHERE crm_link.user_id = auth.uid()
      AND crm_link.is_active = true
      AND lower(btrim(coalesce(crm_em.role, ''))) = 'crm'
      AND (
        -- Check if dealer code matches first part (numeric format: 500A840_131)
        upper(btrim(coalesce(crm_link.dealer_code, ''))) = upper(btrim(split_part(coalesce(p_sa_employee_code, ''), '_', 1)))
        OR
        -- Check if dealer code matches second part (text format: EPM_500A840)
        upper(btrim(coalesce(crm_link.dealer_code, ''))) = upper(btrim(split_part(coalesce(p_sa_employee_code, ''), '_', 2)))
      )
  );
$$;

COMMENT ON FUNCTION public.user_is_crm_for_dealer_sa(text) IS
'Returns true when authenticated user has an active CRM mapping and the dealer code (either before or after underscore in sa_employee_code) matches the CRM user''s dealer. Handles both numeric (500A840_131) and text (EPM_500A840) formats.';

DROP POLICY IF EXISTS service_reception_select_crm_dealer_scope ON public.service_reception_entries;

CREATE POLICY service_reception_select_crm_dealer_scope
  ON public.service_reception_entries
  FOR SELECT
  TO authenticated
  USING (
    public.has_module_view('service_advisor')
    AND sa_employee_code IS NOT NULL
    AND public.user_is_crm_for_dealer_sa(sa_employee_code)
  );

COMMENT ON POLICY service_reception_select_crm_dealer_scope ON public.service_reception_entries IS
'CRM users with service_advisor module access can view all service reception rows assigned to SAs in their dealer (matched via user_employee_links.dealer_code, not row-level dealer_code column).';
