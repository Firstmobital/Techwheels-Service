-- RBAC Phase 3 foundation
-- Adds reusable permission helper functions for future RLS hardening.
-- Verification checks were executed via a temporary paired sql_checks file and recorded in DB ledger evidence.

CREATE OR REPLACE FUNCTION public.has_module_view(p_module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.get_my_permissions(p_module) p
      WHERE COALESCE(p.can_view, false) = true
    );
$$;

ALTER FUNCTION public.has_module_view(text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.has_module_view(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_module_modify(p_module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.get_my_permissions(p_module) p
      WHERE COALESCE(p.can_modify, false) = true
    );
$$;

ALTER FUNCTION public.has_module_modify(text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.has_module_modify(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_module_delete(p_module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.get_my_permissions(p_module) p
      WHERE COALESCE(p.can_delete, false) = true
    );
$$;

ALTER FUNCTION public.has_module_delete(text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.has_module_delete(text) TO authenticated;
