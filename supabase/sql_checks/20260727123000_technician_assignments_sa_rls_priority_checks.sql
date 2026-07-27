-- Post-apply checks for 20260727123000_fix_technician_assignments_sa_rls_priority.sql

-- 1) sa_tracker included in broad read policy
SELECT pol.polname, pg_get_expr(pol.polqual, pol.polrelid) AS using_expr
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
WHERE cls.relname = 'technician_assignments'
  AND pol.polname = 'technician_assignments_select_rbac';

-- 2) SA policy must NOT call user_sa_owns when floor_incharge/sa_tracker present
SELECT pol.polname, pg_get_expr(pol.polqual, pol.polrelid) AS using_expr
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
WHERE cls.relname = 'technician_assignments'
  AND pol.polname = 'technician_assignments_select_sa_own_jobs';

-- 3) Smoke: broad policy expression mentions sa_tracker
SELECT EXISTS (
  SELECT 1
  FROM pg_policy pol
  JOIN pg_class cls ON cls.oid = pol.polrelid
  WHERE cls.relname = 'technician_assignments'
    AND pol.polname = 'technician_assignments_select_rbac'
    AND pg_get_expr(pol.polqual, pol.polrelid) LIKE '%sa_tracker%'
) AS rbac_includes_sa_tracker;
