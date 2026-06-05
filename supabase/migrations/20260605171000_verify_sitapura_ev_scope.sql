-- ============================================================================
-- VERIFY: CRM user should only see 500A840 (Sitapura, EV) SAs
-- ============================================================================

-- Step 1: Verify CRM user's mapping
SELECT 
  'CRM User Mapping' as step,
  uel.employee_code,
  uel.dealer_code,
  em.role,
  em.fuel_type
FROM public.user_employee_links uel
JOIN public.employee_master em ON em.employee_code = uel.employee_code
WHERE uel.user_id = auth.uid()
  AND uel.is_active = true
  AND lower(btrim(coalesce(em.role, ''))) = 'crm';

-- Step 2: Count SAs mapped to 500A840 with EV fuel type
SELECT 
  'SAs in 500A840 with EV' as step,
  COUNT(*) as sa_count
FROM public.user_employee_links sa_link
JOIN public.employee_master sa_em ON sa_em.employee_code = sa_link.employee_code
WHERE upper(btrim(coalesce(sa_link.dealer_code, ''))) = '500A840'
  AND sa_link.is_active = true
  AND lower(btrim(coalesce(sa_em.role, ''))) = 'service_advisor'
  AND lower(btrim(coalesce(sa_em.fuel_type, ''))) = 'ev';

-- Step 3: Count service_reception_entries rows assigned to those SAs
SELECT 
  'Rows assigned to 500A840 SAs (EV)' as step,
  COUNT(*) as row_count
FROM public.service_reception_entries sre
WHERE sre.sa_employee_code IN (
  SELECT sa_link.employee_code
  FROM public.user_employee_links sa_link
  JOIN public.employee_master sa_em ON sa_em.employee_code = sa_link.employee_code
  WHERE upper(btrim(coalesce(sa_link.dealer_code, ''))) = '500A840'
    AND sa_link.is_active = true
    AND lower(btrim(coalesce(sa_em.role, ''))) = 'service_advisor'
    AND lower(btrim(coalesce(sa_em.fuel_type, ''))) = 'ev'
);

-- Step 4: Show sample of SAs in 500A840 EV
SELECT 
  'Sample 500A840 SAs (EV)' as step,
  sa_link.employee_code,
  sa_em.employee_name,
  sa_em.fuel_type,
  sa_link.dealer_code
FROM public.user_employee_links sa_link
JOIN public.employee_master sa_em ON sa_em.employee_code = sa_link.employee_code
WHERE upper(btrim(coalesce(sa_link.dealer_code, ''))) = '500A840'
  AND sa_link.is_active = true
  AND lower(btrim(coalesce(sa_em.role, ''))) = 'service_advisor'
  AND lower(btrim(coalesce(sa_em.fuel_type, ''))) = 'ev'
LIMIT 10;
