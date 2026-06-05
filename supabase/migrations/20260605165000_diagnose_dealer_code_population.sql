-- ============================================================================
-- STEP 1: Check data population status
-- ============================================================================
SELECT 
  COUNT(*) as total_rows,
  COUNT(CASE WHEN dealer_code IS NOT NULL THEN 1 END) as rows_with_dealer_code,
  COUNT(CASE WHEN dealer_code IS NULL THEN 1 END) as rows_with_null_dealer_code,
  COUNT(CASE WHEN sa_employee_code IS NOT NULL THEN 1 END) as rows_with_sa_employee_code
FROM public.service_reception_entries;

-- Show a sample row
SELECT 
  id,
  reg_number,
  dealer_code,
  sa_employee_code,
  sa_name,
  sa_display_name,
  created_at
FROM public.service_reception_entries
LIMIT 1;

-- ============================================================================
-- STEP 2: Check current user's CRM mappings (as logged-in user)
-- ============================================================================
-- This assumes you run as the logged-in user via JWT
SELECT 
  uel.user_id,
  uel.employee_code,
  uel.dealer_code,
  em.role,
  em.fuel_type,
  uel.is_active,
  uel.is_primary
FROM public.user_employee_links uel
JOIN public.employee_master em ON em.employee_code = uel.employee_code
WHERE uel.user_id = auth.uid()
ORDER BY uel.is_primary DESC, uel.updated_at DESC;

-- ============================================================================
-- STEP 3: Check how many rows match user's CRM dealer scope
-- ============================================================================
-- Get user's CRM dealer codes
WITH user_crm_dealers AS (
  SELECT DISTINCT upper(btrim(coalesce(uel.dealer_code, ''))) as crm_dealer_code
  FROM public.user_employee_links uel
  JOIN public.employee_master em ON em.employee_code = uel.employee_code
  WHERE uel.user_id = auth.uid()
    AND uel.is_active = true
    AND lower(btrim(coalesce(em.role, ''))) = 'crm'
)
SELECT 
  'Rows matching CRM dealer scope' as metric,
  COUNT(*) as count
FROM public.service_reception_entries sre
WHERE upper(btrim(coalesce(sre.dealer_code, ''))) IN (SELECT crm_dealer_code FROM user_crm_dealers)
  AND sre.dealer_code IS NOT NULL;

-- ============================================================================
-- STEP 4: Check row distribution by dealer_code
-- ============================================================================
SELECT 
  CASE WHEN dealer_code IS NULL THEN '[NULL]' ELSE dealer_code END as dealer_code,
  COUNT(*) as count
FROM public.service_reception_entries
GROUP BY dealer_code
ORDER BY count DESC;
