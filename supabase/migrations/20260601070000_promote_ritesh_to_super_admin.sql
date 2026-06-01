-- Migration: Promote Ritesh to super admin-equivalent access
-- Date: 2026-06-01
-- Purpose:
-- 1) Set users.role='admin' and activate account for Ritesh
-- 2) Ensure full module permissions (view/modify/delete) across all active modules
-- 3) Verify parity with existing admin account admin@firstmobital.com

BEGIN;

-- Target users
-- - Existing admin reference: admin@firstmobital.com
-- - New super admin: ritesh@indiraswitch.com

-- Step 1: Promote Ritesh user role to admin and ensure active
UPDATE public.users
SET role = 'admin',
    is_active = true,
    updated_at = now()
WHERE email = 'ritesh@indiraswitch.com';

-- Step 2: Grant full permissions to both admin users on all active modules
INSERT INTO public.user_module_permissions (
  user_id,
  module_id,
  can_view,
  can_modify,
  can_delete,
  granted_by,
  granted_at
)
SELECT
  u.id AS user_id,
  m.id AS module_id,
  true AS can_view,
  true AS can_modify,
  true AS can_delete,
  NULL::uuid AS granted_by,
  now() AS granted_at
FROM public.users u
CROSS JOIN public.modules m
WHERE u.email IN ('admin@firstmobital.com', 'ritesh@indiraswitch.com')
  AND m.is_active = true
ON CONFLICT (user_id, module_id)
DO UPDATE SET
  can_view = true,
  can_modify = true,
  can_delete = true,
  granted_at = now();

-- Verification 1: Role and status for both admin users
SELECT
  u.id,
  u.email,
  u.full_name,
  u.role,
  u.is_active,
  u.branch,
  u.updated_at
FROM public.users u
WHERE u.email IN ('admin@firstmobital.com', 'ritesh@indiraswitch.com')
ORDER BY u.email;

-- Verification 2: Permission coverage for both admin users (active modules only)
SELECT
  u.email,
  COUNT(*) FILTER (WHERE ump.can_view) AS modules_with_view,
  COUNT(*) FILTER (WHERE ump.can_modify) AS modules_with_modify,
  COUNT(*) FILTER (WHERE ump.can_delete) AS modules_with_delete,
  COUNT(*) AS total_module_permission_rows
FROM public.users u
LEFT JOIN public.user_module_permissions ump
  ON ump.user_id = u.id
LEFT JOIN public.modules m
  ON m.id = ump.module_id
WHERE u.email IN ('admin@firstmobital.com', 'ritesh@indiraswitch.com')
  AND (m.is_active = true OR m.id IS NULL)
GROUP BY u.email
ORDER BY u.email;

-- Verification 3: Any active modules missing full permissions for Ritesh (should return 0 rows)
SELECT
  m.name AS missing_module,
  COALESCE(ump.can_view, false) AS can_view,
  COALESCE(ump.can_modify, false) AS can_modify,
  COALESCE(ump.can_delete, false) AS can_delete
FROM public.modules m
CROSS JOIN public.users u
LEFT JOIN public.user_module_permissions ump
  ON ump.user_id = u.id
 AND ump.module_id = m.id
WHERE u.email = 'ritesh@indiraswitch.com'
  AND m.is_active = true
  AND (
    ump.user_id IS NULL
    OR ump.can_view IS DISTINCT FROM true
    OR ump.can_modify IS DISTINCT FROM true
    OR ump.can_delete IS DISTINCT FROM true
  )
ORDER BY m.sort_order, m.name;

COMMIT;
