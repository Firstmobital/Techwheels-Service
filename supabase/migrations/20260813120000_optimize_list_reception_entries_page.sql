-- Optimize list_reception_entries_page (57014 / ~1s mean, ~8s max on prod audit 14.50).
--
-- Root cause: SECURITY DEFINER bypasses RLS but still called
-- user_can_read_service_reception_entry() per scanned row, often over a wide
-- created_at range with default page_size=200 and no dealer pre-filter.
--
-- Fix (mirrors 20260801120000 SA summary fast paths):
-- 1. Classify scope once (admin / reception-dealer / SA-own-codes / broad).
-- 2. Use CASE so Postgres picks idx_sre_dealer_created_at_id_desc or
--    idx_sre_sa_code_created_at_desc instead of seq scan + per-row auth.
-- 3. Cap page_size at 100 (default 100).
-- 4. Add small helper RPCs for remaining direct-table callers.

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
BEGIN
  IF p_created_at_from IS NULL OR p_created_at_to IS NULL THEN
    RAISE EXCEPTION 'created_at range is required'
      USING ERRCODE = '22023';
  END IF;

  v_search := NULLIF(btrim(coalesce(p_search_query, '')), '');
  v_page_size := least(greatest(coalesce(p_page_size, 100), 1), 100);

  RETURN QUERY
  WITH gate AS (
    SELECT public.is_admin() AS is_admin
  ),
  my_codes AS MATERIALIZED (
    SELECT coalesce(
      array_agg(DISTINCT upper(btrim(code))) FILTER (WHERE btrim(coalesce(code, '')) <> ''),
      ARRAY[]::text[]
    ) AS codes
    FROM public.my_active_employee_codes() AS code
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
      ) AS reception_dealer_only,
      (
        NOT g.is_admin
        AND coalesce((SELECT array_length(mc.codes, 1) FROM my_codes mc), 0) > 0
        AND NOT public.has_module_view('reception'::text)
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
      ) AS employee_code_only
    FROM gate g
  )
  SELECT r.*
    FROM public.service_reception_entries r
    CROSS JOIN scope_mode sm
    CROSS JOIN my_codes mc
    CROSS JOIN my_dealers md
   WHERE r.created_at >= p_created_at_from
     AND r.created_at <= p_created_at_to
     AND CASE
       WHEN sm.is_admin THEN true
       WHEN sm.reception_dealer_only THEN upper(btrim(r.dealer_code)) = ANY (md.codes)
       WHEN sm.employee_code_only THEN upper(btrim(r.sa_employee_code)) = ANY (mc.codes)
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
   'Uses scope_mode fast paths (dealer / SA codes) before summary_scope.';

GRANT EXECUTE ON FUNCTION public.list_reception_entries_page(
  timestamptz, timestamptz, integer, timestamptz, bigint, text[], text, boolean
) TO authenticated;


CREATE OR REPLACE FUNCTION public.list_reception_jc_numbers_by_sa(
  p_sa_employee_code text
)
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT NULLIF(btrim(r.jc_number), '')
    FROM public.service_reception_entries r
   WHERE upper(btrim(r.sa_employee_code)) = upper(btrim(coalesce(p_sa_employee_code, '')))
     AND NULLIF(btrim(r.jc_number), '') IS NOT NULL
     AND (
       public.is_admin()
       OR public.user_has_employee_code(p_sa_employee_code)
       OR public.service_reception_entry_in_summary_scope(
         r.dealer_code,
         r.sa_employee_code,
         r.service_type
       )
     )
   ORDER BY 1;
$$;

COMMENT ON FUNCTION public.list_reception_jc_numbers_by_sa(text)
IS 'Distinct JC numbers for an SA code; bypasses authenticated RLS.';

GRANT EXECUTE ON FUNCTION public.list_reception_jc_numbers_by_sa(text) TO authenticated;


CREATE OR REPLACE FUNCTION public.list_reception_reg_created_since(
  p_since timestamptz
)
RETURNS TABLE(reg_number text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_since IS NULL THEN
    RAISE EXCEPTION 'p_since is required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH gate AS (
    SELECT public.is_admin() AS is_admin
  ),
  my_codes AS MATERIALIZED (
    SELECT coalesce(
      array_agg(DISTINCT upper(btrim(code))) FILTER (WHERE btrim(coalesce(code, '')) <> ''),
      ARRAY[]::text[]
    ) AS codes
    FROM public.my_active_employee_codes() AS code
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
      ) AS reception_dealer_only,
      (
        NOT g.is_admin
        AND coalesce((SELECT array_length(mc.codes, 1) FROM my_codes mc), 0) > 0
        AND NOT public.has_module_view('reception'::text)
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
      ) AS employee_code_only
    FROM gate g
  )
  SELECT r.reg_number, r.created_at
    FROM public.service_reception_entries r
    CROSS JOIN scope_mode sm
    CROSS JOIN my_codes mc
    CROSS JOIN my_dealers md
   WHERE r.created_at >= p_since
     AND CASE
       WHEN sm.is_admin THEN true
       WHEN sm.reception_dealer_only THEN upper(btrim(r.dealer_code)) = ANY (md.codes)
       WHEN sm.employee_code_only THEN upper(btrim(r.sa_employee_code)) = ANY (mc.codes)
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
IS 'Reg numbers + created_at since timestamp for booking cross-check; bypasses RLS.';

GRANT EXECUTE ON FUNCTION public.list_reception_reg_created_since(timestamptz) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_reception_entries_by_ids(
  p_ids bigint[]
)
RETURNS TABLE(
  id bigint,
  model text,
  km_reading integer,
  dealer_code text,
  jc_number text,
  reg_number text,
  owner_name text,
  owner_phone text,
  branch text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.model,
    r.km_reading,
    r.dealer_code,
    r.jc_number,
    r.reg_number,
    r.owner_name,
    r.owner_phone,
    r.branch,
    r.created_at
    FROM public.service_reception_entries r
   WHERE r.id = ANY (p_ids)
     AND (
       public.is_admin()
       OR public.service_reception_entry_in_summary_scope(
         r.dealer_code,
         r.sa_employee_code,
         r.service_type
       )
     )
   ORDER BY r.id;
END;
$$;

COMMENT ON FUNCTION public.get_reception_entries_by_ids(bigint[])
IS 'Batch reception read by id (subset columns); bypasses authenticated RLS.';

GRANT EXECUTE ON FUNCTION public.get_reception_entries_by_ids(bigint[]) TO authenticated;
