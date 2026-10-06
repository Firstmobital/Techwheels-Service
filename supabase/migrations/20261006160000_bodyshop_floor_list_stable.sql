-- Stable bodyshop floor lists: live-on-floor filter at the database, plus floor counts
-- that do not depend on the current page of 20.

DROP FUNCTION IF EXISTS public.list_bodyshop_repair_cards_page(integer, timestamptz, integer, text, text);

CREATE OR REPLACE FUNCTION public.list_bodyshop_repair_cards_page(
  p_page_size integer DEFAULT 20,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id integer DEFAULT NULL,
  p_search_query text DEFAULT NULL,
  p_bodyshop_floor text DEFAULT NULL,
  p_live_on_floor boolean DEFAULT false
)
RETURNS SETOF public.bodyshop_repair_cards
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO public
AS $$
  WITH params AS (
    SELECT least(greatest(coalesce(p_page_size, 20), 1), 100) AS page_size
  ),
  q AS (
    SELECT trim(coalesce(p_search_query, '')) AS search_q
  )
  SELECT c.*
  FROM public.bodyshop_repair_cards c
  CROSS JOIN params
  CROSS JOIN q
  WHERE coalesce(trim(c.job_card_no), '') <> ''
    AND (
      NOT coalesce(p_live_on_floor, false)
      OR (
        lower(coalesce(c.overall_status, 'active')) NOT IN ('closed', 'cancelled', 'delivered')
        AND c.current_stage BETWEEN 11 AND 14
      )
    )
    AND (
      p_bodyshop_floor IS NULL
      OR trim(c.bodyshop_floor) = trim(p_bodyshop_floor)
      OR (
        upper(replace(trim(coalesce(c.bodyshop_floor, '')), ' ', '')) IN ('FLOOR2', 'F2')
        AND upper(replace(trim(p_bodyshop_floor), ' ', '')) IN ('FLOOR2', 'F2')
      )
      OR (
        upper(replace(trim(coalesce(c.bodyshop_floor, '')), ' ', '')) IN ('FLOOR3', 'F3')
        AND upper(replace(trim(p_bodyshop_floor), ' ', '')) IN ('FLOOR3', 'F3')
      )
    )
    AND (
      q.search_q = ''
      OR c.job_card_no ILIKE '%' || q.search_q || '%'
      OR coalesce(c.reg_number, '') ILIKE '%' || q.search_q || '%'
      OR coalesce(c.customer_name, '') ILIKE '%' || q.search_q || '%'
    )
    AND (
      p_cursor_created_at IS NULL
      OR p_cursor_id IS NULL
      OR (c.created_at, c.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY c.created_at DESC NULLS LAST, c.id DESC
  LIMIT (SELECT page_size FROM params);
$$;

CREATE OR REPLACE FUNCTION public.count_bodyshop_repair_cards_by_floor(
  p_search_query text DEFAULT NULL,
  p_live_on_floor boolean DEFAULT false
)
RETURNS TABLE (bodyshop_floor text, vehicle_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO public
AS $$
  WITH q AS (
    SELECT trim(coalesce(p_search_query, '')) AS search_q
  )
  SELECT
    coalesce(nullif(trim(c.bodyshop_floor), ''), '(unassigned)') AS bodyshop_floor,
    count(*)::bigint AS vehicle_count
  FROM public.bodyshop_repair_cards c
  CROSS JOIN q
  WHERE coalesce(trim(c.job_card_no), '') <> ''
    AND (
      NOT coalesce(p_live_on_floor, false)
      OR (
        lower(coalesce(c.overall_status, 'active')) NOT IN ('closed', 'cancelled', 'delivered')
        AND c.current_stage BETWEEN 11 AND 14
      )
    )
    AND (
      q.search_q = ''
      OR c.job_card_no ILIKE '%' || q.search_q || '%'
      OR coalesce(c.reg_number, '') ILIKE '%' || q.search_q || '%'
      OR coalesce(c.customer_name, '') ILIKE '%' || q.search_q || '%'
    )
  GROUP BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.list_bodyshop_repair_cards_page(integer, timestamptz, integer, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_bodyshop_repair_cards_page(integer, timestamptz, integer, text, text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.list_bodyshop_repair_cards_page(integer, timestamptz, integer, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_bodyshop_repair_cards_by_floor(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_bodyshop_repair_cards_by_floor(text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.count_bodyshop_repair_cards_by_floor(text, boolean) TO service_role;
