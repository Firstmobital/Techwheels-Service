-- ============================================================================
-- VERIFY: Are all CRM-visible rows actually dealer-scoped?
-- ============================================================================

-- Check CRM user's mapped dealer code(s)
WITH user_crm_info AS (
  SELECT 
    uel.user_id,
    uel.employee_code,
    uel.dealer_code,
    em.role
  FROM public.user_employee_links uel
  JOIN public.employee_master em ON em.employee_code = uel.employee_code
  WHERE uel.user_id = auth.uid()
    AND uel.is_active = true
    AND lower(btrim(coalesce(em.role, ''))) = 'crm'
)
SELECT 'User CRM mapping' as check_name, dealer_code, count(*) as count
FROM user_crm_info
GROUP BY dealer_code;

-- Check how many service_reception_entries rows the CRM user can see
-- and whether they're all scoped to their dealer code
SELECT 
  COUNT(*) as total_visible_rows,
  COUNT(CASE 
    WHEN dealer_code IS NOT NULL THEN 1 
  END) as rows_with_dealer_code,
  COUNT(DISTINCT dealer_code) as unique_dealer_codes
FROM public.service_reception_entries;

-- Show distribution of rows by dealer_code (to see if they align with CRM's dealer)
SELECT 
  CASE WHEN dealer_code IS NULL THEN '[NULL]' ELSE dealer_code END as dealer_code,
  COUNT(*) as row_count
FROM public.service_reception_entries
WHERE sa_employee_code IS NOT NULL
GROUP BY dealer_code
ORDER BY row_count DESC
LIMIT 10;

-- Check if CRM user's dealer code matches the rows they should see
WITH user_dealer AS (
  SELECT upper(btrim(coalesce(uel.dealer_code, ''))) as crm_dealer
  FROM public.user_employee_links uel
  JOIN public.employee_master em ON em.employee_code = uel.employee_code
  WHERE uel.user_id = auth.uid()
    AND uel.is_active = true
    AND lower(btrim(coalesce(em.role, ''))) = 'crm'
  LIMIT 1
)
SELECT 
  'Rows matching CRM user dealer scope' as metric,
  COUNT(*) as count,
  COUNT(CASE WHEN upper(btrim(coalesce(sre.dealer_code, ''))) IN (SELECT crm_dealer FROM user_dealer) THEN 1 END) as rows_in_crm_scope,
  COUNT(CASE WHEN upper(btrim(coalesce(sre.dealer_code, ''))) NOT IN (SELECT crm_dealer FROM user_dealer) THEN 1 END) as rows_outside_crm_scope
FROM public.service_reception_entries sre
WHERE sre.sa_employee_code IS NOT NULL;
