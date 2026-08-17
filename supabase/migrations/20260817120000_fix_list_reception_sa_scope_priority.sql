-- Fix Service Advisor list 57014 when user has both reception + service_advisor modules.
--
-- Root cause: list_reception_entries_page checked reception_dealer_only BEFORE
-- employee_code_only, and employee_code_only required NOT has_module_view('reception').
-- SA users with reception flag scanned the full dealer (summary RPC uses SA fast path).
--
-- Fix: mirror get_service_advisor_summary_counts (live in full_metadata.sql):
--   NOT is_admin AND NOT user_needs_sa_summary_broad_scope()
--     -> INNER JOIN user_employee_links on sa_employee_code (never scope_fn).
-- Reception-dealer path remains for broad-scope / reception-only callers.

CREATE OR REPLACE FUNCTION public.list_reception_entries_page(
  p_created_at_from       timestamptz,
  p_created_at_to         timestamptz,
  p_page_size             integer     DEFAULT 100,
  p_cursor_created_at     timestamptz DEFAULT NULL,
  p_cursor_id             bigint      DEFAULT NULL,
  p_service_types         text[]      DEFAULT NULL,
  p_search_query          text        DEFAULT NULL,
  p_require_non_empty_jc  boolean     DEFAULT false
)
RETURNS SETOF public.service_reception_entries
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_search text;
  v_page_size integer;
  v_is_admin boolean;
  v_broad_scope boolean;
BEGIN
  IF p_created_at_from IS NULL OR p_created_at_to IS NULL THEN
    RAISE EXCEPTION 'created_at range is required'
      USING ERRCODE = '22023';
  END IF;

  v_search := NULLIF(btrim(coalesce(p_search_query, '')), '');
  v_page_size := least(greatest(coalesce(p_page_size, 100), 1), 100);
  v_is_admin := public.is_admin();
  v_broad_scope := public.user_needs_sa_summary_broad_scope();

  -- Assigned advisor fast path: JOIN own employee link rows only (matches summary RPC).
  IF NOT v_is_admin AND NOT v_broad_scope THEN
    RETURN QUERY
    SELECT r.*
      FROM public.service_reception_entries r
      INNER JOIN public.user_employee_links uel
        ON uel.user_id = auth.uid()
        AND uel.is_active = true
        AND uel.employee_code = r.sa_employee_code
     WHERE r.created_at >= p_created_at_from
       AND r.created_at <= p_created_at_to
       AND (
         p_service_types IS NULL
         OR cardinality(p_service_types) = 0
         OR r.service_type = ANY (p_service_types)
       )
       AND (
         NOT coalesce(p_require_non_empty_jc, false)
         OR NULLIF(btrim(r.jc_number), '') IS NOT NULL
       )
       AND (
         v_search IS NULL
         OR r.reg_number ILIKE ('%' || v_search || '%')
         OR coalesce(r.model, '') ILIKE ('%' || v_search || '%')
         OR coalesce(r.jc_number, '') ILIKE ('%' || v_search || '%')
         OR coalesce(r.owner_name, '') ILIKE ('%' || v_search || '%')
         OR coalesce(r.owner_phone, '') ILIKE ('%' || v_search || '%')
         OR coalesce(r.sa_name, '') ILIKE ('%' || v_search || '%')
         OR coalesce(r.sa_display_name, '') ILIKE ('%' || v_search || '%')
         OR coalesce(r.source, '') ILIKE ('%' || v_search || '%')
         OR coalesce(r.created_by, '') ILIKE ('%' || v_search || '%')
       )
       AND (
         p_cursor_created_at IS NULL
         OR p_cursor_id IS NULL
         OR (r.created_at, r.id) < (p_cursor_created_at, p_cursor_id)
       )
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT v_page_size;
    RETURN;
  END IF;

  RETURN QUERY
  WITH gate AS (
    SELECT v_is_admin AS is_admin
  ),
  my_dealers AS MATERIALIZED (
    SELECT coalesce(
      array_agg(DISTINCT upper(btrim(dc))) FILTER (WHERE btrim(coalesce(dc, '')) <> ''),
      ARRAY[]::text[]
    ) AS codes
    FROM unnest(public.my_effective_dealer_codes()) AS dc
  ),
  scope_mode AS (
    SELECT
      g.is_admin,
      (
        NOT g.is_admin
        AND public.has_module_view('reception'::text)
        AND (SELECT coalesce(array_length(md.codes, 1), 0) FROM my_dealers md) > 0
        AND NOT public.has_module_view('floor_incharge'::text)
        AND NOT public.has_module_view('bodyshop_floor'::text)
        AND NOT public.has_module_modify('bodyshop_floor'::text)
        AND NOT EXISTS (
          SELECT 1
          FROM public.user_employee_links uel
          JOIN public.employee_master em ON em.employee_code = uel.employee_code
          WHERE uel.user_id = auth.uid()
            AND uel.is_active = true
            AND (
              public.employee_has_business_role(em.role, 'CRM')
              OR public.employee_has_business_role(em.role, 'SM')
              OR public.employee_has_business_role(em.role, 'GM')
              OR public.employee_has_business_role(em.role, 'FLOOR_INCHARGE')
            )
        )
      ) AS reception_dealer_only
    FROM gate g
  )
  SELECT r.*
    FROM public.service_reception_entries r
    CROSS JOIN scope_mode sm
    CROSS JOIN my_dealers md
   WHERE r.created_at >= p_created_at_from
     AND r.created_at <= p_created_at_to
     AND CASE
       WHEN sm.is_admin THEN true
       WHEN sm.reception_dealer_only THEN upper(btrim(r.dealer_code)) = ANY (md.codes)
       ELSE public.service_reception_entry_in_summary_scope(
         r.dealer_code,
         r.sa_employee_code,
         r.service_type
       )
     END
     AND (
       p_service_types IS NULL
       OR cardinality(p_service_types) = 0
       OR r.service_type = ANY (p_service_types)
     )
     AND (
       NOT coalesce(p_require_non_empty_jc, false)
       OR NULLIF(btrim(r.jc_number), '') IS NOT NULL
     )
     AND (
       v_search IS NULL
       OR r.reg_number ILIKE ('%' || v_search || '%')
       OR coalesce(r.model, '') ILIKE ('%' || v_search || '%')
       OR coalesce(r.jc_number, '') ILIKE ('%' || v_search || '%')
       OR coalesce(r.owner_name, '') ILIKE ('%' || v_search || '%')
       OR coalesce(r.owner_phone, '') ILIKE ('%' || v_search || '%')
       OR coalesce(r.sa_name, '') ILIKE ('%' || v_search || '%')
       OR coalesce(r.sa_display_name, '') ILIKE ('%' || v_search || '%')
       OR coalesce(r.source, '') ILIKE ('%' || v_search || '%')
       OR coalesce(r.created_by, '') ILIKE ('%' || v_search || '%')
     )
     AND (
       p_cursor_created_at IS NULL
       OR p_cursor_id IS NULL
       OR (r.created_at, r.id) < (p_cursor_created_at, p_cursor_id)
     )
   ORDER BY r.created_at DESC, r.id DESC
   LIMIT v_page_size;
END;
$$;

COMMENT ON FUNCTION public.list_reception_entries_page(
  timestamptz, timestamptz, integer, timestamptz, bigint, text[], text, boolean
)
IS 'Paginated reception list bypassing authenticated-role RLS (57014). '
   'Advisor fast path uses user_employee_links JOIN (same gate as get_service_advisor_summary_counts).';

GRANT EXECUTE ON FUNCTION public.list_reception_entries_page(
  timestamptz, timestamptz, integer, timestamptz, bigint, text[], text, boolean
) TO authenticated;


CREATE OR REPLACE FUNCTION public.list_reception_reg_created_since(
  p_since timestamptz
)
RETURNS TABLE(reg_number text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean;
  v_broad_scope boolean;
BEGIN
  IF p_since IS NULL THEN
    RAISE EXCEPTION 'p_since is required' USING ERRCODE = '22023';
  END IF;

  v_is_admin := public.is_admin();
  v_broad_scope := public.user_needs_sa_summary_broad_scope();

  IF NOT v_is_admin AND NOT v_broad_scope THEN
    RETURN QUERY
    SELECT r.reg_number, r.created_at
      FROM public.service_reception_entries r
      INNER JOIN public.user_employee_links uel
        ON uel.user_id = auth.uid()
        AND uel.is_active = true
        AND uel.employee_code = r.sa_employee_code
     WHERE r.created_at >= p_since
     ORDER BY r.created_at DESC;
    RETURN;
  END IF;

  RETURN QUERY
  WITH gate AS (
    SELECT v_is_admin AS is_admin
  ),
  my_dealers AS MATERIALIZED (
    SELECT coalesce(
      array_agg(DISTINCT upper(btrim(dc))) FILTER (WHERE btrim(coalesce(dc, '')) <> ''),
      ARRAY[]::text[]
    ) AS codes
    FROM unnest(public.my_effective_dealer_codes()) AS dc
  ),
  scope_mode AS (
    SELECT
      g.is_admin,
      (
        NOT g.is_admin
        AND public.has_module_view('reception'::text)
        AND (SELECT coalesce(array_length(md.codes, 1), 0) FROM my_dealers md) > 0
        AND NOT public.has_module_view('floor_incharge'::text)
        AND NOT public.has_module_view('bodyshop_floor'::text)
        AND NOT public.has_module_modify('bodyshop_floor'::text)
        AND NOT EXISTS (
          SELECT 1
          FROM public.user_employee_links uel
          JOIN public.employee_master em ON em.employee_code = uel.employee_code
          WHERE uel.user_id = auth.uid()
            AND uel.is_active = true
            AND (
              public.employee_has_business_role(em.role, 'CRM')
              OR public.employee_has_business_role(em.role, 'SM')
              OR public.employee_has_business_role(em.role, 'GM')
              OR public.employee_has_business_role(em.role, 'FLOOR_INCHARGE')
            )
        )
      ) AS reception_dealer_only
    FROM gate g
  )
  SELECT r.reg_number, r.created_at
    FROM public.service_reception_entries r
    CROSS JOIN scope_mode sm
    CROSS JOIN my_dealers md
   WHERE r.created_at >= p_since
     AND CASE
       WHEN sm.is_admin THEN true
       WHEN sm.reception_dealer_only THEN upper(btrim(r.dealer_code)) = ANY (md.codes)
       ELSE public.service_reception_entry_in_summary_scope(
         r.dealer_code,
         r.sa_employee_code,
         r.service_type
       )
     END
   ORDER BY r.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.list_reception_reg_created_since(timestamptz)
IS 'Reg numbers + created_at since timestamp; advisor JOIN fast path matches summary RPC.';

GRANT EXECUTE ON FUNCTION public.list_reception_reg_created_since(timestamptz) TO authenticated;
