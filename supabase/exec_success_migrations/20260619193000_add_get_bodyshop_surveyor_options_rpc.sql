BEGIN;

-- Stable dropdown source for Bodyshop Survey tab.
-- Uses SECURITY DEFINER to avoid client-side RLS edge-cases while still enforcing
-- authenticated-user access constraints and dealer scoping.
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
      FROM public.user_employee_links uel
      JOIN public.employee_master em
        ON em.employee_code = uel.employee_code
      WHERE uel.user_id = v_uid
        AND uel.is_active = true
        AND UPPER(COALESCE(em.department, '')) = 'BODYSHOP'
        AND UPPER(COALESCE(em.role, '')) IN ('SA', 'SSA', 'SURVEY')
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

COMMENT ON FUNCTION public.get_bodyshop_surveyor_options() IS
  'Returns dealer-scoped bodyshop surveyor options for Survey tab dropdown with role/module guard.';

GRANT EXECUTE ON FUNCTION public.get_bodyshop_surveyor_options() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bodyshop_surveyor_options() TO service_role;

COMMIT;
