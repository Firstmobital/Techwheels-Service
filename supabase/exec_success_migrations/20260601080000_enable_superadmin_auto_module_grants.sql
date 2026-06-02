-- Migration: Enable automatic full-module grants for super admins (users.role='admin')
-- Date: 2026-06-01
-- Purpose:
-- 1) Backfill full permissions for all active admin users on all active modules
-- 2) Auto-grant full permissions when a new module is created/activated
-- 3) Auto-grant full permissions when a user becomes active admin

BEGIN;

-- Step 1: Backfill parity now (all active admins get full rights on all active modules)
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
  u.id,
  m.id,
  true,
  true,
  true,
  NULL::uuid,
  now()
FROM public.users u
CROSS JOIN public.modules m
WHERE u.role = 'admin'
  AND u.is_active = true
  AND m.is_active = true
ON CONFLICT (user_id, module_id)
DO UPDATE SET
  can_view = true,
  can_modify = true,
  can_delete = true,
  granted_at = now();

-- Step 2: Function + triggers for new/activated modules
CREATE OR REPLACE FUNCTION public.grant_active_module_to_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active = true THEN
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
      u.id,
      NEW.id,
      true,
      true,
      true,
      NULL::uuid,
      now()
    FROM public.users u
    WHERE u.role = 'admin'
      AND u.is_active = true
    ON CONFLICT (user_id, module_id)
    DO UPDATE SET
      can_view = true,
      can_modify = true,
      can_delete = true,
      granted_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_active_module_to_admins_after_insert ON public.modules;
CREATE TRIGGER trg_grant_active_module_to_admins_after_insert
AFTER INSERT ON public.modules
FOR EACH ROW
WHEN (NEW.is_active = true)
EXECUTE FUNCTION public.grant_active_module_to_admins();

DROP TRIGGER IF EXISTS trg_grant_active_module_to_admins_after_update ON public.modules;
CREATE TRIGGER trg_grant_active_module_to_admins_after_update
AFTER UPDATE OF is_active ON public.modules
FOR EACH ROW
WHEN (NEW.is_active = true AND OLD.is_active IS DISTINCT FROM NEW.is_active)
EXECUTE FUNCTION public.grant_active_module_to_admins();

-- Step 3: Function + triggers for users promoted/activated as admin
CREATE OR REPLACE FUNCTION public.grant_admin_all_active_modules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'admin' AND NEW.is_active = true THEN
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
      NEW.id,
      m.id,
      true,
      true,
      true,
      NULL::uuid,
      now()
    FROM public.modules m
    WHERE m.is_active = true
    ON CONFLICT (user_id, module_id)
    DO UPDATE SET
      can_view = true,
      can_modify = true,
      can_delete = true,
      granted_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_admin_all_active_modules_after_insert ON public.users;
CREATE TRIGGER trg_grant_admin_all_active_modules_after_insert
AFTER INSERT ON public.users
FOR EACH ROW
WHEN (NEW.role = 'admin' AND NEW.is_active = true)
EXECUTE FUNCTION public.grant_admin_all_active_modules();

DROP TRIGGER IF EXISTS trg_grant_admin_all_active_modules_after_update ON public.users;
CREATE TRIGGER trg_grant_admin_all_active_modules_after_update
AFTER UPDATE OF role, is_active ON public.users
FOR EACH ROW
WHEN (
  NEW.role = 'admin'
  AND NEW.is_active = true
  AND (OLD.role IS DISTINCT FROM NEW.role OR OLD.is_active IS DISTINCT FROM NEW.is_active)
)
EXECUTE FUNCTION public.grant_admin_all_active_modules();

-- Verification 1: Active module parity across all active admins
SELECT
  u.email,
  COUNT(*) FILTER (WHERE ump.can_view = true) AS active_modules_with_view,
  COUNT(*) FILTER (WHERE ump.can_modify = true) AS active_modules_with_modify,
  COUNT(*) FILTER (WHERE ump.can_delete = true) AS active_modules_with_delete,
  COUNT(*) AS active_module_permission_rows
FROM public.users u
JOIN public.user_module_permissions ump ON ump.user_id = u.id
JOIN public.modules m ON m.id = ump.module_id AND m.is_active = true
WHERE u.role = 'admin' AND u.is_active = true
GROUP BY u.email
ORDER BY u.email;

-- Verification 2: Missing active-module grants for any active admin (should return 0 rows)
SELECT
  u.email,
  m.name AS missing_module,
  COALESCE(ump.can_view, false) AS can_view,
  COALESCE(ump.can_modify, false) AS can_modify,
  COALESCE(ump.can_delete, false) AS can_delete
FROM public.users u
CROSS JOIN public.modules m
LEFT JOIN public.user_module_permissions ump
  ON ump.user_id = u.id
 AND ump.module_id = m.id
WHERE u.role = 'admin'
  AND u.is_active = true
  AND m.is_active = true
  AND (
    ump.user_id IS NULL
    OR ump.can_view IS DISTINCT FROM true
    OR ump.can_modify IS DISTINCT FROM true
    OR ump.can_delete IS DISTINCT FROM true
  )
ORDER BY u.email, m.sort_order, m.name;

COMMIT;
