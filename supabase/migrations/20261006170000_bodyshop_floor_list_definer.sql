-- Bodyshop floor list was timing out under SECURITY INVOKER: the repair-card
-- SELECT policy runs a reception EXISTS (and its RLS) once per candidate row.
-- These list/count RPCs check module access once, then read as the owner.

CREATE INDEX IF NOT EXISTS idx_bodyshop_repair_cards_live_floor_created
  ON public.bodyshop_repair_cards (created_at DESC, id DESC)
  WHERE current_stage BETWEEN 11 AND 14
    AND lower(coalesce(overall_status, 'active')) NOT IN ('closed', 'cancelled', 'delivered');

CREATE OR REPLACE FUNCTION public.list_bodyshop_repair_cards_page(
  p_page_size integer DEFAULT 20,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id integer DEFAULT NULL,
  p_search_query text DEFAULT NULL,
  p_bodyshop_floor text DEFAULT NULL,
  p_live_on_floor boolean DEFAULT false
)
RETURNS SETOF public.bodyshop_repair_cards
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
SET statement_timeout TO '20s'
AS $$
DECLARE
  v_page integer;
  v_search text;
  v_floor text;
  v_floor_key text;
  v_admin boolean;
  v_dealers text[];
BEGIN
  IF NOT (
    public.is_admin()
    OR public.has_module_view('admin')
    OR public.has_module_modify('admin')
    OR public.has_module_view('bodyshop_floor')
    OR public.has_module_modify('bodyshop_floor')
    OR public.has_module_view('bodyshop_repair')
    OR public.has_module_modify('bodyshop_repair')
    OR public.has_module_view('bodyshop_floor_work')
    OR public.has_module_modify('bodyshop_floor_work')
    OR public.has_module_view('bodyshop_tracker')
    OR public.has_module_view('service_advisor')
    OR public.has_module_view('reception')
  ) THEN
    RETURN;
  END IF;

  v_admin := public.is_admin()
    OR public.has_module_view('admin')
    OR public.has_module_modify('admin')
    OR public.has_module_modify('bodyshop_floor')
    OR public.user_is_linked_bodyshop_floor_incharge();

  IF NOT v_admin THEN
    SELECT coalesce(array_agg(upper(btrim(code))), ARRAY[]::text[])
      INTO v_dealers
    FROM unnest(public.my_effective_dealer_codes()) AS code
    WHERE btrim(coalesce(code, '')) <> '';
  END IF;

  v_page := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search := trim(coalesce(p_search_query, ''));
  v_floor := nullif(trim(coalesce(p_bodyshop_floor, '')), '');
  v_floor_key := upper(replace(coalesce(v_floor, ''), ' ', ''));

  RETURN QUERY
  SELECT c.*
  FROM public.bodyshop_repair_cards c
  WHERE coalesce(trim(c.job_card_no), '') <> ''
    AND (
      NOT coalesce(p_live_on_floor, false)
      OR (
        lower(coalesce(c.overall_status, 'active')) NOT IN ('closed', 'cancelled', 'delivered')
        AND c.current_stage BETWEEN 11 AND 14
      )
    )
    AND (
      v_floor IS NULL
      OR c.bodyshop_floor = v_floor
      OR (
        v_floor_key IN ('FLOOR2', 'F2')
        AND upper(replace(trim(coalesce(c.bodyshop_floor, '')), ' ', '')) IN ('FLOOR2', 'F2')
      )
      OR (
        v_floor_key IN ('FLOOR3', 'F3')
        AND upper(replace(trim(coalesce(c.bodyshop_floor, '')), ' ', '')) IN ('FLOOR3', 'F3')
      )
    )
    AND (
      v_search = ''
      OR c.job_card_no ILIKE '%' || v_search || '%'
      OR coalesce(c.reg_number, '') ILIKE '%' || v_search || '%'
      OR coalesce(c.customer_name, '') ILIKE '%' || v_search || '%'
    )
    AND (
      p_cursor_created_at IS NULL
      OR p_cursor_id IS NULL
      OR (c.created_at, c.id) < (p_cursor_created_at, p_cursor_id)
    )
    AND (
      v_admin
      OR upper(btrim(split_part(coalesce(c.sa_employee_code, ''), '_', 1))) = ANY (v_dealers)
      OR upper(btrim(split_part(coalesce(c.sa_employee_code, ''), '_', 2))) = ANY (v_dealers)
    )
  ORDER BY c.created_at DESC NULLS LAST, c.id DESC
  LIMIT v_page;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_bodyshop_repair_cards_by_floor(
  p_search_query text DEFAULT NULL,
  p_live_on_floor boolean DEFAULT false
)
RETURNS TABLE (bodyshop_floor text, vehicle_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
SET statement_timeout TO '20s'
AS $$
DECLARE
  v_search text;
  v_admin boolean;
  v_dealers text[];
BEGIN
  IF NOT (
    public.is_admin()
    OR public.has_module_view('admin')
    OR public.has_module_modify('admin')
    OR public.has_module_view('bodyshop_floor')
    OR public.has_module_modify('bodyshop_floor')
    OR public.has_module_view('bodyshop_repair')
    OR public.has_module_modify('bodyshop_repair')
    OR public.has_module_view('bodyshop_floor_work')
    OR public.has_module_modify('bodyshop_floor_work')
    OR public.has_module_view('bodyshop_tracker')
    OR public.has_module_view('service_advisor')
    OR public.has_module_view('reception')
  ) THEN
    RETURN;
  END IF;

  v_admin := public.is_admin()
    OR public.has_module_view('admin')
    OR public.has_module_modify('admin')
    OR public.has_module_modify('bodyshop_floor')
    OR public.user_is_linked_bodyshop_floor_incharge();

  IF NOT v_admin THEN
    SELECT coalesce(array_agg(upper(btrim(code))), ARRAY[]::text[])
      INTO v_dealers
    FROM unnest(public.my_effective_dealer_codes()) AS code
    WHERE btrim(coalesce(code, '')) <> '';
  END IF;

  v_search := trim(coalesce(p_search_query, ''));

  RETURN QUERY
  SELECT
    coalesce(nullif(trim(c.bodyshop_floor), ''), '(unassigned)') AS bodyshop_floor,
    count(*)::bigint AS vehicle_count
  FROM public.bodyshop_repair_cards c
  WHERE coalesce(trim(c.job_card_no), '') <> ''
    AND (
      NOT coalesce(p_live_on_floor, false)
      OR (
        lower(coalesce(c.overall_status, 'active')) NOT IN ('closed', 'cancelled', 'delivered')
        AND c.current_stage BETWEEN 11 AND 14
      )
    )
    AND (
      v_search = ''
      OR c.job_card_no ILIKE '%' || v_search || '%'
      OR coalesce(c.reg_number, '') ILIKE '%' || v_search || '%'
      OR coalesce(c.customer_name, '') ILIKE '%' || v_search || '%'
    )
    AND (
      v_admin
      OR upper(btrim(split_part(coalesce(c.sa_employee_code, ''), '_', 1))) = ANY (v_dealers)
      OR upper(btrim(split_part(coalesce(c.sa_employee_code, ''), '_', 2))) = ANY (v_dealers)
    )
  GROUP BY 1;
END;
$$;

REVOKE ALL ON FUNCTION public.list_bodyshop_repair_cards_page(integer, timestamptz, integer, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_bodyshop_repair_cards_by_floor(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_bodyshop_repair_cards_page(integer, timestamptz, integer, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_bodyshop_repair_cards_page(integer, timestamptz, integer, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_bodyshop_repair_cards_by_floor(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_bodyshop_repair_cards_by_floor(text, boolean) TO service_role;
