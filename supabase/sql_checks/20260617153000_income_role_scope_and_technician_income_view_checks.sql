-- Read-only verification checks for migration 20260617153000

-- 1) New eligibility matrix exists
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'income_role_scope';

-- 2) Seed row exists for technician pilot module
SELECT module_key, assignment_source, employee_role, is_active
FROM public.income_role_scope
WHERE module_key = 'technician_income'
  AND assignment_source = 'technician_assignments'
ORDER BY employee_role;

-- 3) Helper function exists
SELECT routine_schema, routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'is_income_assignment_eligible';

-- 4) Technician income projection view exists
SELECT table_schema, table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name = 'vw_technician_income_assignments';

-- 5) Spot check: non-empty result means projection is active
SELECT COUNT(*) AS projected_rows
FROM public.vw_technician_income_assignments;

-- 6) Optional audit: assignments excluded from technician-income view
SELECT COUNT(*) AS excluded_non_eligible_rows
FROM public.technician_assignments ta
WHERE NOT EXISTS (
  SELECT 1
  FROM public.vw_technician_income_assignments v
  WHERE v.id = ta.id
);
