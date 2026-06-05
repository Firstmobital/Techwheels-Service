-- After executing the updated 20260605163000_add_crm_dealer_scope_for_service_advisor.sql,
-- run these verification steps:

-- ============================================================================
-- VERIFY: New CRM helper function has correct semantics
-- ============================================================================
SELECT 
  proname as function_name,
  prosecdef as is_security_definer,
  provolatile as volatility
FROM pg_proc
WHERE proname = 'user_is_crm_for_sa_code'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Expected: 1 row, user_is_crm_for_sa_code, true, s

-- ============================================================================
-- VERIFY: Policy definition text is correct
-- ============================================================================
SELECT 
  policyname,
  qual as policy_condition
FROM pg_policies
WHERE tablename = 'service_reception_entries'
  AND policyname = 'service_reception_select_crm_dealer_scope';

-- Expected: should include:
--   public.has_module_view('service_advisor')
--   AND sa_employee_code IS NOT NULL
--   AND public.user_is_crm_for_sa_code(sa_employee_code)

-- ============================================================================
-- TEST: Does current logged-in CRM user now see more rows?
-- ============================================================================
-- As CRM user, test basic query
SELECT COUNT(*) as visible_rows
FROM public.service_reception_entries;

-- Check if it matches total rows (means CRM sees all)
SELECT 
  (SELECT COUNT(*) FROM public.service_reception_entries) as total_rows,
  (SELECT COUNT(*) FROM public.service_reception_entries 
   WHERE sa_employee_code IS NOT NULL) as rows_with_sa_code;

-- ============================================================================
-- SEMANTIC CHECK: CRM visibility now works like Floor Incharge
-- ============================================================================
-- Floor Incharge policy:
--   has_module_view('floor_incharge')
--   AND sa_employee_code IS NOT NULL
--   AND user_has_floor_incharge_scope_for_sa_code(sa_employee_code)
--
-- CRM policy (NOW):
--   has_module_view('service_advisor')
--   AND sa_employee_code IS NOT NULL
--   AND user_is_crm_for_sa_code(sa_employee_code)  ← checks user has CRM role (any dealer)
--
-- Result: Both grant organization-wide view access based on role membership,
--         not column matching. This is the correct pattern for admin/CRM roles.
