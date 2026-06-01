-- Validation Script: Verify backfill data integrity
-- Purpose: Ensure no orphans, FKs are intact, coverage is acceptable
-- Date: 2026-06-01

-- Step 1: Check service_reception_entries backfill coverage
SELECT 
  'SERVICE_RECEPTION_ENTRIES_COVERAGE' as check_name,
  COUNT(*) FILTER (WHERE sa_employee_code IS NOT NULL) as with_employee_code,
  COUNT(*) FILTER (WHERE sa_employee_code IS NULL) as without_employee_code,
  ROUND(100.0 * COUNT(*) FILTER (WHERE sa_employee_code IS NOT NULL) / NULLIF(COUNT(*), 0), 2) as coverage_percentage
FROM public.service_reception_entries;

-- Step 2: Verify FK integrity (all sa_employee_code values exist in employee_master)
SELECT 
  'FK_INTEGRITY_CHECK' as check_name,
  COUNT(*) as orphaned_records
FROM public.service_reception_entries sre
WHERE sre.sa_employee_code IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.employee_master em
    WHERE em.employee_code = sre.sa_employee_code
  );

-- Step 3: Check user_employee_links integrity
SELECT 
  'USER_EMPLOYEE_LINKS_COVERAGE' as check_name,
  COUNT(*) as total_links,
  COUNT(DISTINCT user_id) as total_users,
  COUNT(DISTINCT employee_code) as total_employees,
  COUNT(*) FILTER (WHERE is_primary = true AND is_active = true) as active_primary_links
FROM public.user_employee_links;

-- Step 4: Verify no duplicate active primary mappings
SELECT 
  'DUPLICATE_PRIMARY_MAPPING_CHECK' as check_name,
  COUNT(*) as duplicate_count
FROM (
  SELECT user_id, dealer_code, COUNT(*) as cnt
  FROM public.user_employee_links
  WHERE is_primary = true AND is_active = true
  GROUP BY user_id, dealer_code
  HAVING COUNT(*) > 1
) subq;

-- Step 5: Find users with SA permission but no active mapping
SELECT 
  u.id as user_id,
  u.email,
  u.full_name,
  'SA_PERMISSION_WITHOUT_MAPPING' as issue
FROM public.users u
INNER JOIN public.user_module_permissions ump ON u.id = ump.user_id
INNER JOIN public.modules m ON ump.module_id = m.id AND LOWER(m.name) = 'service_advisor'
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_employee_links uel
  WHERE uel.user_id = u.id AND uel.is_primary = true AND uel.is_active = true
);

-- Step 6: Find reception entries with SA assignment but missing critical fields
SELECT 
  id as reception_id,
  sa_name as crm_sa_name,
  sa_display_name,
  sa_employee_code,
  dealer_code,
  created_at,
  CASE 
    WHEN sa_employee_code IS NULL AND sa_name IS NOT NULL THEN 'MISSING_EMPLOYEE_CODE'
    WHEN sa_display_name IS NULL AND sa_employee_code IS NOT NULL THEN 'MISSING_DISPLAY_NAME'
    WHEN sa_employee_code IS NULL AND sa_display_name IS NULL THEN 'MISSING_BOTH'
    ELSE 'UNEXPECTED'
  END as issue
FROM public.service_reception_entries
WHERE (sa_employee_code IS NULL OR sa_display_name IS NULL) AND sa_name IS NOT NULL
ORDER BY created_at DESC;

-- Step 7: Summary report
SELECT 
  'VALIDATION_SUMMARY' as report,
  (SELECT COUNT(*) FROM public.user_employee_links WHERE is_primary = true AND is_active = true)::text as "Active Primary Mappings",
  (SELECT COUNT(*) FROM public.service_reception_entries WHERE sa_employee_code IS NOT NULL)::text as "Reception Entries with sa_employee_code",
  (SELECT COUNT(*) FROM public.service_reception_entries WHERE sa_employee_code IS NULL AND sa_name IS NOT NULL)::text as "Unresolved Reception Entries"
