-- P1-13: Stop 57014 on reception list for CRM/reception/floor/admin callers.
--
-- Root cause (prod logs 2026-08-17): CRM/SM/GM with reception module were excluded from
-- reception_dealer_only (NOT EXISTS CRM check copied from SA-summary logic). They hit the
-- broad path and called service_reception_entry_in_summary_scope() per scanned row
-- (user_is_crm_for_dealer_sa / user_has_service_floor_incharge_scope_for_sa_code).
--
-- Fix (builds on 20260817150000):
-- 1. reception_dealer_only: any reception-module user with dealer codes (incl. CRM/SM/GM).
-- 2. Dedicated early RETURN paths: admin, SA own-codes, reception-dealer, floor incharge.
-- 3. Floor: precompute allowed SA codes once (fuel_type match) → JOIN idx_sre_sa_code_created_at_desc.
-- 4. Residual broad path: outer dealer pre-filter before summary_scope.

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
  v_use_advisor_own_codes boolean;
  v_reception_dealer_only boolean;
  v_use_floor_incharge_scope boolean;
  v_dealer_codes text[];
BEGIN
  IF p_created_at_from IS NULL OR p_created_at_to IS NULL THEN
    RAISE EXCEPTION 'created_at range is required'
      USING ERRCODE = '22023';
  END IF;

  v_search := NULLIF(btrim(coalesce(p_search_query, '')), '');
  v_page_size := least(greatest(coalesce(p_page_size, 100), 1), 100);
  v_is_admin := public.is_admin();
  v_broad_scope := public.user_needs_sa_summary_broad_scope();

  SELECT coalesce(
    array_agg(DISTINCT upper(btrim(dc))) FILTER (WHERE btrim(coalesce(dc, '')) <> ''),
    ARRAY[]::text[]
  )
    INTO v_dealer_codes
    FROM unnest(public.my_effective_dealer_codes()) AS dc;

  v_reception_dealer_only :=
    NOT v_is_admin
    AND public.has_module_view('reception'::text)
    AND coalesce(array_length(v_dealer_codes, 1), 0) > 0
    AND NOT public.has_module_view('floor_incharge'::text)
    AND NOT public.has_module_view('bodyshop_floor'::text)
    AND NOT public.has_module_modify('bodyshop_floor'::text);

  v_use_advisor_own_codes :=
    NOT v_is_admin
    AND NOT v_broad_scope
    AND (
      public.has_module_view('service_advisor'::text)
      OR public.has_module_modify('service_advisor'::text)
    )
    AND NOT public.has_module_view('floor_incharge'::text)
    AND NOT public.has_module_view('bodyshop_floor'::text)
    AND NOT public.has_module_modify('bodyshop_floor'::text)
    AND EXISTS (
      SELECT 1
      FROM public.user_employee_links uel
      WHERE uel.user_id = auth.uid()
        AND uel.is_active = true
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_employee_links uel
      JOIN public.employee_master em ON em.employee_code = uel.employee_code
      WHERE uel.user_id = auth.uid()
        AND uel.is_active = true
        AND public.employee_has_business_role(em.role, 'FLOOR_INCHARGE')
    );

  v_use_floor_incharge_scope :=
    NOT v_is_admin
    AND NOT v_reception_dealer_only
    AND public.has_module_view('floor_incharge'::text)
    AND NOT public.has_module_view('bodyshop_floor'::text)
    AND NOT public.has_module_modify('bodyshop_floor'::text);

  IF v_is_admin THEN
    RETURN QUERY
    SELECT r.*
      FROM public.service_reception_entries r
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

  IF v_use_advisor_own_codes THEN
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

  IF v_reception_dealer_only THEN
    RETURN QUERY
    SELECT r.*
      FROM public.service_reception_entries r
     WHERE r.created_at >= p_created_at_from
       AND r.created_at <= p_created_at_to
       AND upper(btrim(r.dealer_code)) = ANY (v_dealer_codes)
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

  IF v_use_floor_incharge_scope THEN
    RETURN QUERY
    WITH allowed_sa AS MATERIALIZED (
      SELECT DISTINCT upper(btrim(sa.employee_code)) AS sa_code
        FROM public.employee_master sa
       WHERE btrim(coalesce(sa.employee_code, '')) <> ''
         AND EXISTS (
           SELECT 1
             FROM public.user_employee_links uel_fi
             JOIN public.employee_master fi ON fi.employee_code = uel_fi.employee_code
            WHERE uel_fi.user_id = auth.uid()
              AND uel_fi.is_active = true
              AND public.employee_has_business_role(fi.role, 'FLOOR_INCHARGE')
              AND upper(replace(btrim(coalesce(fi.department, '')), ' ', '')) = 'SERVICE'
              AND nullif(lower(btrim(coalesce(fi.fuel_type, ''))), '') IS NOT NULL
              AND lower(btrim(coalesce(fi.fuel_type, ''))) = lower(btrim(coalesce(sa.fuel_type, '')))
         )
    )
    SELECT r.*
      FROM public.service_reception_entries r
      INNER JOIN allowed_sa a
        ON upper(btrim(r.sa_employee_code)) = a.sa_code
     WHERE r.created_at >= p_created_at_from
       AND r.created_at <= p_created_at_to
       AND (
         coalesce(array_length(v_dealer_codes, 1), 0) = 0
         OR upper(btrim(r.dealer_code)) = ANY (v_dealer_codes)
       )
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
  WITH my_dealers AS MATERIALIZED (
    SELECT v_dealer_codes AS codes
  )
  SELECT r.*
    FROM public.service_reception_entries r
    CROSS JOIN my_dealers md
   WHERE r.created_at >= p_created_at_from
     AND r.created_at <= p_created_at_to
     AND (
       coalesce(array_length(md.codes, 1), 0) = 0
       OR upper(btrim(r.dealer_code)) = ANY (md.codes)
     )
     AND public.service_reception_entry_in_summary_scope(
       r.dealer_code,
       r.sa_employee_code,
       r.service_type
     )
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
IS 'Paginated reception list. Fast paths: admin, SA own-codes, reception-dealer (incl CRM), floor SA JOIN. '
   'Residual: dealer pre-filter + summary_scope (bodyshop / SA-only CRM).';

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
  v_use_advisor_own_codes boolean;
  v_reception_dealer_only boolean;
  v_use_floor_incharge_scope boolean;
  v_dealer_codes text[];
  v_row_limit constant integer := 10000;
BEGIN
  IF p_since IS NULL THEN
    RAISE EXCEPTION 'p_since is required' USING ERRCODE = '22023';
  END IF;

  v_is_admin := public.is_admin();
  v_broad_scope := public.user_needs_sa_summary_broad_scope();

  SELECT coalesce(
    array_agg(DISTINCT upper(btrim(dc))) FILTER (WHERE btrim(coalesce(dc, '')) <> ''),
    ARRAY[]::text[]
  )
    INTO v_dealer_codes
    FROM unnest(public.my_effective_dealer_codes()) AS dc;

  v_reception_dealer_only :=
    NOT v_is_admin
    AND public.has_module_view('reception'::text)
    AND coalesce(array_length(v_dealer_codes, 1), 0) > 0
    AND NOT public.has_module_view('floor_incharge'::text)
    AND NOT public.has_module_view('bodyshop_floor'::text)
    AND NOT public.has_module_modify('bodyshop_floor'::text);

  v_use_advisor_own_codes :=
    NOT v_is_admin
    AND NOT v_broad_scope
    AND (
      public.has_module_view('service_advisor'::text)
      OR public.has_module_modify('service_advisor'::text)
    )
    AND NOT public.has_module_view('floor_incharge'::text)
    AND NOT public.has_module_view('bodyshop_floor'::text)
    AND NOT public.has_module_modify('bodyshop_floor'::text)
    AND EXISTS (
      SELECT 1
      FROM public.user_employee_links uel
      WHERE uel.user_id = auth.uid()
        AND uel.is_active = true
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_employee_links uel
      JOIN public.employee_master em ON em.employee_code = uel.employee_code
      WHERE uel.user_id = auth.uid()
        AND uel.is_active = true
        AND public.employee_has_business_role(em.role, 'FLOOR_INCHARGE')
    );

  v_use_floor_incharge_scope :=
    NOT v_is_admin
    AND NOT v_reception_dealer_only
    AND public.has_module_view('floor_incharge'::text)
    AND NOT public.has_module_view('bodyshop_floor'::text)
    AND NOT public.has_module_modify('bodyshop_floor'::text);

  IF v_is_admin THEN
    RETURN QUERY
    SELECT r.reg_number, r.created_at
      FROM public.service_reception_entries r
     WHERE r.created_at >= p_since
     ORDER BY r.created_at DESC
     LIMIT v_row_limit;
    RETURN;
  END IF;

  IF v_use_advisor_own_codes THEN
    RETURN QUERY
    SELECT r.reg_number, r.created_at
      FROM public.service_reception_entries r
      INNER JOIN public.user_employee_links uel
        ON uel.user_id = auth.uid()
        AND uel.is_active = true
        AND uel.employee_code = r.sa_employee_code
     WHERE r.created_at >= p_since
     ORDER BY r.created_at DESC
     LIMIT v_row_limit;
    RETURN;
  END IF;

  IF v_reception_dealer_only THEN
    RETURN QUERY
    SELECT r.reg_number, r.created_at
      FROM public.service_reception_entries r
     WHERE r.created_at >= p_since
       AND upper(btrim(r.dealer_code)) = ANY (v_dealer_codes)
     ORDER BY r.created_at DESC
     LIMIT v_row_limit;
    RETURN;
  END IF;

  IF v_use_floor_incharge_scope THEN
    RETURN QUERY
    WITH allowed_sa AS MATERIALIZED (
      SELECT DISTINCT upper(btrim(sa.employee_code)) AS sa_code
        FROM public.employee_master sa
       WHERE btrim(coalesce(sa.employee_code, '')) <> ''
         AND EXISTS (
           SELECT 1
             FROM public.user_employee_links uel_fi
             JOIN public.employee_master fi ON fi.employee_code = uel_fi.employee_code
            WHERE uel_fi.user_id = auth.uid()
              AND uel_fi.is_active = true
              AND public.employee_has_business_role(fi.role, 'FLOOR_INCHARGE')
              AND upper(replace(btrim(coalesce(fi.department, '')), ' ', '')) = 'SERVICE'
              AND nullif(lower(btrim(coalesce(fi.fuel_type, ''))), '') IS NOT NULL
              AND lower(btrim(coalesce(fi.fuel_type, ''))) = lower(btrim(coalesce(sa.fuel_type, '')))
         )
    )
    SELECT r.reg_number, r.created_at
      FROM public.service_reception_entries r
      INNER JOIN allowed_sa a
        ON upper(btrim(r.sa_employee_code)) = a.sa_code
     WHERE r.created_at >= p_since
       AND (
         coalesce(array_length(v_dealer_codes, 1), 0) = 0
         OR upper(btrim(r.dealer_code)) = ANY (v_dealer_codes)
       )
     ORDER BY r.created_at DESC
     LIMIT v_row_limit;
    RETURN;
  END IF;

  RETURN QUERY
  WITH my_dealers AS MATERIALIZED (
    SELECT v_dealer_codes AS codes
  )
  SELECT r.reg_number, r.created_at
    FROM public.service_reception_entries r
    CROSS JOIN my_dealers md
   WHERE r.created_at >= p_since
     AND (
       coalesce(array_length(md.codes, 1), 0) = 0
       OR upper(btrim(r.dealer_code)) = ANY (md.codes)
     )
     AND public.service_reception_entry_in_summary_scope(
       r.dealer_code,
       r.sa_employee_code,
       r.service_type
     )
   ORDER BY r.created_at DESC
   LIMIT v_row_limit;
END;
$$;

COMMENT ON FUNCTION public.list_reception_reg_created_since(timestamptz)
IS 'Reg numbers + created_at since timestamp. Fast paths: admin, SA own-codes, reception-dealer, floor SA JOIN; max 10000 rows.';

GRANT EXECUTE ON FUNCTION public.list_reception_reg_created_since(timestamptz) TO authenticated;
