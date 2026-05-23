-- Verification script for AutoDoc module addition
-- Read-only: Validates that AutoDoc module exists with correct properties

SELECT 
  'module_creation_check' AS check_name,
  COUNT(*) AS autodoc_count,
  CASE 
    WHEN COUNT(*) = 1 THEN 'PASS'
    ELSE 'FAIL'
  END AS status
FROM public.modules
WHERE name = 'autodoc';

-- Detailed validation
SELECT 
  'autodoc_module_details' AS check_name,
  id,
  name,
  label,
  description,
  icon,
  route,
  sort_order,
  is_active,
  CASE
    WHEN name = 'autodoc' 
      AND label = 'AutoDoc' 
      AND route = '/autodoc'
      AND is_active = true
      AND sort_order = 9
    THEN 'COMPLETE'
    ELSE 'INCOMPLETE'
  END AS validation_status
FROM public.modules
WHERE name = 'autodoc';

-- Verify module sequence updated
SELECT 
  'sequence_check' AS check_name,
  last_value AS max_module_id,
  CASE
    WHEN last_value >= 9 THEN 'PASS'
    ELSE 'FAIL'
  END AS status
FROM public.modules_id_seq;
