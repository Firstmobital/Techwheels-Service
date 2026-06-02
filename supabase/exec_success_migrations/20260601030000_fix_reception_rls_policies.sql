-- Migration: Fix reception and service_advisor RLS policies with correct action semantics
-- Purpose: Enforce can_modify/can_delete for write actions (not can_view)
--          Replace name-based SA policies with employee-code-based policies (immutable CRM identity)
--          Keep display name for UI only; use employee_code for all access control
-- Date: 2026-06-01
--
-- Critical principle:
-- - RLS filtering uses sa_employee_code (immutable SA_CODE from CRM)
-- - sa_display_name is cached for UI convenience, but NOT used for access decisions
-- - sa_name is immutable CRM data, kept for audit only

BEGIN;

-- Drop old name-based SA policies (if they exist)
DROP POLICY IF EXISTS service_reception_select_sa_v1 ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_update_sa_v1 ON public.service_reception_entries;

-- Fix reception INSERT/UPDATE/DELETE policies to use correct action semantics
-- First, identify and drop old reception policies that incorrectly use has_module_view for writes
DROP POLICY IF EXISTS service_reception_entries_select_public ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_entries_insert_public ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_entries_update_public ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_entries_delete_public ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_select_rbac ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_insert_rbac ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_update_rbac ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_delete_rbac ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_select_sa ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_update_sa ON public.service_reception_entries;

-- Recreate reception policies with correct semantics
CREATE POLICY service_reception_select_rbac ON public.service_reception_entries
  FOR SELECT TO authenticated
  USING (
    public.my_dealer_code() = dealer_code
    AND public.has_module_view('reception')
  );

CREATE POLICY service_reception_insert_rbac ON public.service_reception_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.my_dealer_code() = dealer_code
    AND public.has_module_modify('reception')
  );

CREATE POLICY service_reception_update_rbac ON public.service_reception_entries
  FOR UPDATE TO authenticated
  USING (
    public.my_dealer_code() = dealer_code
    AND public.has_module_modify('reception')
  )
  WITH CHECK (
    public.my_dealer_code() = dealer_code
    AND public.has_module_modify('reception')
  );

CREATE POLICY service_reception_delete_rbac ON public.service_reception_entries
  FOR DELETE TO authenticated
  USING (
    public.my_dealer_code() = dealer_code
    AND public.has_module_delete('reception')
  );

-- Create new employee-code-based SA policies (replacing old name-based logic)
-- CRITICAL: Filter by sa_employee_code (immutable CRM identity), NOT sa_name or sa_display_name
CREATE POLICY service_reception_select_sa ON public.service_reception_entries
  FOR SELECT TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND public.has_module_view('service_advisor')
    AND sa_employee_code = public.my_sa_employee_code()
  );

CREATE POLICY service_reception_update_sa ON public.service_reception_entries
  FOR UPDATE TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND public.has_module_modify('service_advisor')
    AND sa_employee_code = public.my_sa_employee_code()
  )
  WITH CHECK (
    dealer_code = public.my_dealer_code()
    AND public.has_module_modify('service_advisor')
    AND sa_employee_code = public.my_sa_employee_code()
  );

-- Service Advisor cannot delete assigned rows (if needed in future, create separate policy)

COMMIT;
