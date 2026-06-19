BEGIN;

-- Resolve surveyor visibility from explicit user->dealer mapping for bodyshop roles,
-- instead of relying only on dealer_code_in_scope() / module scope state.
CREATE OR REPLACE FUNCTION public.can_access_bodyshop_surveyor_settings(target_dealer text)
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

  -- Settings/bodyshop module users: allow via existing dealer scope OR active dealer mapping.
  IF (
    public.has_module_view('settings'::text)
    OR public.has_module_view('bodyshop_repair'::text)
    OR public.has_module_modify('bodyshop_repair'::text)
  ) AND (
    public.dealer_code_in_scope(target_dealer)
    OR EXISTS (
      SELECT 1
      FROM public.user_employee_links uel
      WHERE uel.user_id = v_uid
        AND uel.is_active = true
        AND uel.dealer_code = target_dealer
    )
  ) THEN
    RETURN true;
  END IF;

  -- Bodyshop execution roles (SA/SSA/SURVEY) mapped to same dealer.
  IF EXISTS (
    SELECT 1
    FROM public.user_employee_links uel
    JOIN public.employee_master em
      ON em.employee_code = uel.employee_code
    WHERE uel.user_id = v_uid
      AND uel.is_active = true
      AND uel.dealer_code = target_dealer
      AND UPPER(BTRIM(COALESCE(em.department, ''))) = 'BODYSHOP'
      AND UPPER(BTRIM(COALESCE(em.role, ''))) IN ('SA', 'SSA', 'SURVEY')
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.can_access_bodyshop_surveyor_settings(text) IS
  'Checks whether current user can access bodyshop surveyor settings for a dealer via admin, module scope, or mapped bodyshop role.';

GRANT EXECUTE ON FUNCTION public.can_access_bodyshop_surveyor_settings(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_bodyshop_surveyor_settings(text) TO service_role;

DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v1 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v2 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v3 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v4 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v5 ON public.settings_bodyshop_surveyors;

CREATE POLICY settings_bodyshop_surveyors_select_v6 ON public.settings_bodyshop_surveyors
FOR SELECT TO authenticated
USING (public.can_access_bodyshop_surveyor_settings(dealer_code));

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
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.surveyor_name,
    s.surveyor_contact_number,
    s.surveyor_email,
    s.created_at,
    s.updated_at
  FROM public.settings_bodyshop_surveyors s
  WHERE public.can_access_bodyshop_surveyor_settings(s.dealer_code)
  ORDER BY s.surveyor_name ASC;
END;
$$;

COMMIT;
