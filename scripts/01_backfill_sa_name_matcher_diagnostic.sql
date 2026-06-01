-- Backfill Script: Match existing sa_name values to employee_master.employee_code
-- Purpose: Populate sa_employee_code column by matching sa_name to employee_name
-- Date: 2026-06-01
-- This is a diagnostic/dry-run script. Run first to identify matches/ambiguities before actual data updates.

-- Step 1: Create temporary table to hold match candidates
CREATE TEMP TABLE sa_name_matches AS
SELECT DISTINCT
  sre.id as reception_id,
  sre.sa_name,
  sre.dealer_code,
  em.employee_code,
  em.employee_name,
  CASE 
    WHEN LOWER(TRIM(sre.sa_name)) = LOWER(TRIM(em.employee_name)) THEN 'exact_match'
    WHEN LOWER(TRIM(sre.sa_name)) LIKE LOWER(TRIM(SPLIT_PART(em.employee_name, ' ', 1)) || '%') THEN 'first_name_match'
    ELSE 'no_match'
  END as match_type
FROM public.service_reception_entries sre
LEFT JOIN public.employee_master em 
  ON LOWER(TRIM(sre.sa_name)) = LOWER(TRIM(em.employee_name))
    OR LOWER(TRIM(sre.sa_name)) = LOWER(SPLIT_PART(em.employee_name, ' ', 1))
    OR LOWER(TRIM(sre.sa_name)) = LOWER(SPLIT_PART(em.employee_name, ' ', -1))
WHERE sre.sa_name IS NOT NULL
ORDER BY sre.sa_name, match_type DESC;

-- Step 2: Report matching results
SELECT 
  'EXACT_MATCHES' as category,
  COUNT(*) as count,
  STRING_AGG(DISTINCT sa_name, ', ') as sa_names
FROM sa_name_matches
WHERE match_type = 'exact_match'
UNION ALL
SELECT 
  'FIRST_NAME_MATCHES',
  COUNT(*),
  STRING_AGG(DISTINCT sa_name, ', ')
FROM sa_name_matches
WHERE match_type = 'first_name_match'
UNION ALL
SELECT 
  'UNMATCHED',
  COUNT(*),
  STRING_AGG(DISTINCT sa_name, ', ')
FROM sa_name_matches
WHERE match_type = 'no_match' OR employee_code IS NULL;

-- Step 3: Show reception entries without any sa_name (already NULL)
SELECT 
  'NULL_SA_NAMES' as category,
  COUNT(*) as count,
  NULL as sa_names
FROM public.service_reception_entries
WHERE sa_name IS NULL;

-- Step 4: Show detailed unmatched/ambiguous cases for manual review
SELECT 
  'DETAILED_AMBIGUOUS_CASES' as review_needed,
  sre.id,
  sre.sa_name,
  GROUP_CONCAT(DISTINCT em.employee_code || ' (' || em.employee_name || ')') as possible_matches
FROM public.service_reception_entries sre
LEFT JOIN public.employee_master em 
  ON LOWER(TRIM(sre.sa_name)) LIKE '%' || LOWER(TRIM(SPLIT_PART(em.employee_name, ' ', 1))) || '%'
WHERE sre.sa_name IS NOT NULL
GROUP BY sre.id, sre.sa_name
HAVING COUNT(DISTINCT em.employee_code) > 1 OR COUNT(DISTINCT em.employee_code) = 0;
