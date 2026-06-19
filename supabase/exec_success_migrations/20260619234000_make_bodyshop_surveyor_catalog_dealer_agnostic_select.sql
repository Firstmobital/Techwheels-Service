BEGIN;

-- Surveyor catalog is shared across dealers.
-- SELECT must be dealer-agnostic for authorized users (admin/settings/bodyshop roles).

CREATE OR REPLACE FUNCTION public.can_view_bodyshop_surveyor_catalog()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin() THEN
    RETURN true;
  END IF;

  IF public.has_module_view('settings'::text)
    OR public.has_module_view('bodyshop_repair'::text)
    OR public.has_module_modify('bodyshop_repair'::text)
  THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.get_my_bodyshop_employee_scope() s
    WHERE UPPER(BTRIM(COALESCE(s.role, ''))) IN ('SA', 'SSA', 'SURVEY')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_bodyshop_surveyor_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_bodyshop_surveyor_catalog() TO service_role;

DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v1 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v2 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v3 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v4 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v5 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v6 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v7 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v8 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v9 ON public.settings_bodyshop_surveyors;

CREATE POLICY settings_bodyshop_surveyors_select_v10 ON public.settings_bodyshop_surveyors
FOR SELECT TO authenticated
USING (public.can_view_bodyshop_surveyor_catalog());

-- Keep RPC aligned with dealer-agnostic catalog behavior.
-- Return a de-duplicated list by (surveyor_name, surveyor_contact_number).
CREATE OR REPLACE FUNCTION public.get_bodyshop_surveyor_options()
RETURNS TABLE (
  id bigint,
  surveyor_name text,
  surveyor_contact_number text,
  surveyor_email text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_view_bodyshop_surveyor_catalog() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (
      UPPER(BTRIM(COALESCE(s.surveyor_name, ''))),
      UPPER(BTRIM(COALESCE(s.surveyor_contact_number, '')))
    )
    s.id,
    s.surveyor_name,
    s.surveyor_contact_number,
    s.surveyor_email,
    s.created_at,
    s.updated_at
  FROM public.settings_bodyshop_surveyors s
  WHERE BTRIM(COALESCE(s.surveyor_name, '')) <> ''
    AND BTRIM(COALESCE(s.surveyor_contact_number, '')) <> ''
  ORDER BY
    UPPER(BTRIM(COALESCE(s.surveyor_name, ''))),
    UPPER(BTRIM(COALESCE(s.surveyor_contact_number, ''))),
    s.updated_at DESC,
    s.id DESC;
END;
$$;

COMMIT;
