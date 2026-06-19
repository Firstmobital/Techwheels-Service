BEGIN;

-- Normalize role/department comparisons to handle trailing spaces and casing,
-- and use scope RPC inside policy for stable non-admin behavior.
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v1 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v2 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v3 ON public.settings_bodyshop_surveyors;
DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v4 ON public.settings_bodyshop_surveyors;

CREATE POLICY settings_bodyshop_surveyors_select_v5 ON public.settings_bodyshop_surveyors
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    public.dealer_code_in_scope(dealer_code)
    AND (
      public.has_module_view('settings'::text)
      OR public.has_module_view('bodyshop_repair'::text)
      OR public.has_module_modify('bodyshop_repair'::text)
      OR EXISTS (
        SELECT 1
        FROM public.get_my_bodyshop_employee_scope() s
        WHERE UPPER(BTRIM(COALESCE(s.department, ''))) = 'BODYSHOP'
          AND UPPER(BTRIM(COALESCE(s.role, ''))) IN ('SA', 'SSA', 'SURVEY')
      )
    )
  )
);

-- Keep RPC path aligned with same normalization rules.
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
  v_dealer text := public.my_dealer_code();
  v_allowed boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_allowed := public.is_admin()
    OR public.has_module_view('settings'::text)
    OR public.has_module_view('bodyshop_repair'::text)
    OR public.has_module_modify('bodyshop_repair'::text)
    OR EXISTS (
      SELECT 1
      FROM public.get_my_bodyshop_employee_scope() s
      WHERE UPPER(BTRIM(COALESCE(s.department, ''))) = 'BODYSHOP'
        AND UPPER(BTRIM(COALESCE(s.role, ''))) IN ('SA', 'SSA', 'SURVEY')
    );

  IF NOT v_allowed THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH user_dealers AS (
    SELECT DISTINCT uel.dealer_code
    FROM public.user_employee_links uel
    WHERE uel.user_id = v_uid
      AND uel.is_active = true
      AND uel.dealer_code IS NOT NULL
  )
  SELECT
    s.id,
    s.surveyor_name,
    s.surveyor_contact_number,
    s.surveyor_email,
    s.created_at,
    s.updated_at
  FROM public.settings_bodyshop_surveyors s
  WHERE (
      v_dealer IS NOT NULL
      AND s.dealer_code = v_dealer
    )
    OR (
      v_dealer IS NULL
      AND EXISTS (
        SELECT 1
        FROM user_dealers ud
        WHERE ud.dealer_code = s.dealer_code
      )
    )
  ORDER BY s.surveyor_name ASC;
END;
$$;

COMMIT;
