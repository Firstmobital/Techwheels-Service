BEGIN;

-- Fix Survey-role visibility edge cases by normalizing role checks from scope RPC
-- and avoiding strict department equality assumptions.
CREATE OR REPLACE FUNCTION public.can_access_bodyshop_surveyor_settings(target_dealer text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dealer text := public.my_dealer_code();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin() THEN
    RETURN true;
  END IF;

  IF target_dealer IS NULL OR btrim(target_dealer) = '' THEN
    RETURN false;
  END IF;

  -- Existing module-based grants remain valid.
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

  -- Bodyshop execution-role path: rely on scope RPC role normalization,
  -- and ensure target dealer matches current dealer context or mapped dealer link.
  IF EXISTS (
    SELECT 1
    FROM public.get_my_bodyshop_employee_scope() s
    WHERE UPPER(BTRIM(COALESCE(s.role, ''))) IN ('SA', 'SSA', 'SURVEY')
  )
  AND (
    (v_dealer IS NOT NULL AND target_dealer = v_dealer)
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

  RETURN false;
END;
$$;

DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v1 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v2 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v3 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v4 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v5 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v6 ON public.settings_bodyshop_surveyors;

CREATE POLICY settings_bodyshop_surveyors_select_v7 ON public.settings_bodyshop_surveyors
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
