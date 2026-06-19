BEGIN;

-- Root-cause fix from runtime logs:
-- Queries succeed but return 0 rows for SURVEY users. This indicates row filters evaluate
-- to false. Normalize dealer matching and include active user_employee_links dealer scope
-- directly (case/space safe), aligned with Survey-tab role resolution.

CREATE OR REPLACE FUNCTION public.can_access_bodyshop_surveyor_settings(target_dealer text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target text := UPPER(BTRIM(COALESCE(target_dealer, '')));
  v_has_bodyshop_role boolean := false;
  v_has_module_access boolean := false;
BEGIN
  IF v_uid IS NULL OR v_target = '' THEN
    RETURN false;
  END IF;

  IF public.is_admin() THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.get_my_bodyshop_employee_scope() s
    WHERE UPPER(BTRIM(COALESCE(s.role, ''))) IN ('SA', 'SSA', 'SURVEY')
  ) INTO v_has_bodyshop_role;

  v_has_module_access := (
    public.has_module_view('settings'::text)
    OR public.has_module_view('bodyshop_repair'::text)
    OR public.has_module_modify('bodyshop_repair'::text)
  );

  -- Dealer is in scope if present in either effective dealer list or active user mapping.
  RETURN (
    EXISTS (
      SELECT 1
      FROM unnest(public.my_effective_dealer_codes()) AS dc(code)
      WHERE UPPER(BTRIM(COALESCE(dc.code, ''))) = v_target
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_employee_links uel
      WHERE uel.user_id = v_uid
        AND uel.is_active = true
        AND UPPER(BTRIM(COALESCE(uel.dealer_code, ''))) = v_target
    )
  )
  AND (v_has_module_access OR v_has_bodyshop_role);
END;
$$;

DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v1 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v2 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v3 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v4 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v5 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v6 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v7 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v8 ON public.settings_bodyshop_surveyors;

CREATE POLICY settings_bodyshop_surveyors_select_v9 ON public.settings_bodyshop_surveyors
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
DECLARE
  v_uid uuid := auth.uid();
  v_has_bodyshop_role boolean := false;
  v_has_module_access boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF public.is_admin() THEN
    RETURN QUERY
    SELECT s.id, s.surveyor_name, s.surveyor_contact_number, s.surveyor_email, s.created_at, s.updated_at
    FROM public.settings_bodyshop_surveyors s
    ORDER BY s.surveyor_name ASC;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.get_my_bodyshop_employee_scope() s
    WHERE UPPER(BTRIM(COALESCE(s.role, ''))) IN ('SA', 'SSA', 'SURVEY')
  ) INTO v_has_bodyshop_role;

  v_has_module_access := (
    public.has_module_view('settings'::text)
    OR public.has_module_view('bodyshop_repair'::text)
    OR public.has_module_modify('bodyshop_repair'::text)
  );

  IF NOT (v_has_bodyshop_role OR v_has_module_access) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH allowed_dealers AS (
    SELECT DISTINCT UPPER(BTRIM(COALESCE(dc.code, ''))) AS dealer_code
    FROM unnest(public.my_effective_dealer_codes()) AS dc(code)
    WHERE BTRIM(COALESCE(dc.code, '')) <> ''
    UNION
    SELECT DISTINCT UPPER(BTRIM(COALESCE(uel.dealer_code, ''))) AS dealer_code
    FROM public.user_employee_links uel
    WHERE uel.user_id = v_uid
      AND uel.is_active = true
      AND BTRIM(COALESCE(uel.dealer_code, '')) <> ''
  )
  SELECT
    s.id,
    s.surveyor_name,
    s.surveyor_contact_number,
    s.surveyor_email,
    s.created_at,
    s.updated_at
  FROM public.settings_bodyshop_surveyors s
  WHERE UPPER(BTRIM(COALESCE(s.dealer_code, ''))) IN (
    SELECT dealer_code FROM allowed_dealers
  )
  ORDER BY s.surveyor_name ASC;
END;
$$;

COMMIT;
