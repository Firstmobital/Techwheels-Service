-- Check actual format of sa_employee_code to find dealer code pattern
SELECT 
  sa_employee_code,
  CASE 
    WHEN sa_employee_code LIKE '500A840_%' THEN 'PREFIX_BEFORE_UNDERSCORE'
    WHEN sa_employee_code LIKE '%_500A840' THEN 'SUFFIX_AFTER_UNDERSCORE'
    WHEN sa_employee_code LIKE '%500A840%' THEN 'CONTAINS_500A840'
    ELSE 'NO_500A840'
  END as pattern,
  COUNT(*) as count
FROM public.service_reception_entries
WHERE sa_employee_code IS NOT NULL
GROUP BY sa_employee_code, pattern
ORDER BY count DESC
LIMIT 30;

-- Show some actual sa_employee_code values with 500A840
SELECT DISTINCT sa_employee_code
FROM public.service_reception_entries
WHERE sa_employee_code LIKE '%500A840%'
LIMIT 20;

-- Show all unique sa_employee_code patterns
SELECT DISTINCT sa_employee_code
FROM public.service_reception_entries
WHERE sa_employee_code IS NOT NULL
ORDER BY sa_employee_code
LIMIT 50;
