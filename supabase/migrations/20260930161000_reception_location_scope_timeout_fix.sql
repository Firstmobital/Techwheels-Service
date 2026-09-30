-- DBL-0089 / RECEPTION-003
-- Performance remediation for DBL-0088.
-- Production UAT proved the DBL-0088 data/backfill contract, but the Reception
-- list RPC timed out because it invoked user_has_reception_location_scope_for_sa_code()
-- once per candidate reception row. That helper re-enters business-role parsing
-- and user/employee mapping work for every row.
--
-- Compute the authenticated receptionist's unique Employee Master location once
-- per RPC call, then compare against the persisted reception location/branch that
-- DBL-0088 backfilled and the existing SA mapping trigger maintains.
-- No data rewrite, dealer/RLS rewrite, or non-Reception scope change.

CREATE OR REPLACE FUNCTION public.list_reception_entries_page(p_created_at_from timestamp with time zone, p_created_at_to timestamp with time zone, p_page_size integer DEFAULT 100, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id bigint DEFAULT NULL::bigint, p_service_types text[] DEFAULT NULL::text[], p_search_query text DEFAULT NULL::text, p_require_non_empty_jc boolean DEFAULT false) RETURNS SETOF public.service_reception_entries
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_search text;
  v_page_size integer;
  v_is_admin boolean;
  v_broad_scope boolean;
  v_linked_service_floor_fi_only boolean;
  v_use_advisor_own_codes boolean;
  v_reception_location_only boolean;
  v_reception_location_key text;
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

  SELECT CASE
           WHEN count(DISTINCT public.normalize_employee_location_key(em.location)) = 1
             THEN min(public.normalize_employee_location_key(em.location))
           ELSE NULL
         END
    INTO v_reception_location_key
    FROM public.user_employee_links uel
    JOIN public.employee_master em
      ON upper(btrim(em.employee_code)) = upper(btrim(uel.employee_code))
   WHERE uel.user_id = auth.uid()
     AND uel.is_active = true
     AND em.is_active = true
     AND public.employee_has_business_role(em.role, 'RECEPTION')
     AND public.normalize_employee_location_key(em.location) IS NOT NULL;

  v_reception_location_only :=
    NOT v_is_admin
    AND NOT v_broad_scope
    AND public.has_module_view('reception'::text)
    AND NOT public.has_module_view('service_advisor'::text)
    AND NOT public.has_module_modify('service_advisor'::text)
    AND NOT public.has_module_view('floor_incharge'::text)
    AND NOT public.has_module_view('bodyshop_floor'::text)
    AND NOT public.has_module_modify('bodyshop_floor'::text)
    AND v_reception_location_key IS NOT NULL;

  SELECT coalesce(
    array_agg(DISTINCT upper(btrim(dc))) FILTER (WHERE btrim(coalesce(dc, '')) <> ''),
    ARRAY[]::text[]
  )
    INTO v_dealer_codes
    FROM unnest(public.my_effective_dealer_codes()) AS dc;

  v_reception_dealer_only :=
    NOT v_is_admin
    AND NOT v_reception_location_only
    AND public.has_module_view('reception'::text)
    AND coalesce(array_length(v_dealer_codes, 1), 0) > 0
    AND NOT public.has_module_view('floor_incharge'::text)
    AND NOT public.has_module_view('bodyshop_floor'::text)
    AND NOT public.has_module_modify('bodyshop_floor'::text);

  v_linked_service_floor_fi_only :=
    EXISTS (
      SELECT 1
      FROM public.user_employee_links uel
      JOIN public.employee_master em ON em.employee_code = uel.employee_code
      WHERE uel.user_id = auth.uid()
        AND uel.is_active = true
        AND public.employee_has_business_role(em.role, 'FLOOR_INCHARGE')
        AND upper(replace(btrim(coalesce(em.department, '')), ' ', '')) = 'SERVICE'
        AND NOT public.employee_has_business_role(em.role, 'SA')
    );

  -- Assigned SA path — not bodyshop_floor; not SERVICE floor incharge-only links.
  v_use_advisor_own_codes :=
    NOT v_is_admin
    AND NOT v_reception_location_only
    AND NOT v_broad_scope
    AND NOT public.has_module_view('bodyshop_floor'::text)
    AND NOT public.has_module_modify('bodyshop_floor'::text)
    AND NOT v_linked_service_floor_fi_only
    AND EXISTS (
      SELECT 1
      FROM public.user_employee_links uel
      WHERE uel.user_id = auth.uid()
        AND uel.is_active = true
    );

  v_use_floor_incharge_scope :=
    NOT v_is_admin
    AND NOT v_reception_location_only
    AND NOT v_broad_scope
    AND NOT v_reception_dealer_only
    AND NOT v_use_advisor_own_codes
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

  IF v_reception_location_only THEN
    RETURN QUERY
    SELECT r.*
      FROM public.service_reception_entries r
     WHERE r.created_at >= p_created_at_from
       AND r.created_at <= p_created_at_to
       AND COALESCE(
             public.normalize_employee_location_key(r.location),
             public.normalize_employee_location_key(r.branch)
           ) = v_reception_location_key
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
         AND public.service_floor_incharge_sa_in_scope(sa.fuel_type, sa.location)
    )
    SELECT r.*
      FROM public.service_reception_entries r
      INNER JOIN allowed_sa a
        ON upper(btrim(r.sa_employee_code)) = a.sa_code
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

COMMENT ON FUNCTION public.list_reception_entries_page(timestamp with time zone, timestamp with time zone, integer, timestamp with time zone, bigint, text[], text, boolean) IS
  'DBL-0089: paginated Reception list. Dedicated RECEPTION identities resolve one Employee Master location once per RPC call, then filter persisted reception location/branch; admin/SA/floor/bodyshop/dealer branches remain unchanged.';

CREATE OR REPLACE FUNCTION public.list_reception_reg_created_since(p_since timestamp with time zone) RETURNS TABLE(reg_number text, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_is_admin boolean;
  v_broad_scope boolean;
  v_linked_service_floor_fi_only boolean;
  v_use_advisor_own_codes boolean;
  v_reception_location_only boolean;
  v_reception_location_key text;
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

  SELECT CASE
           WHEN count(DISTINCT public.normalize_employee_location_key(em.location)) = 1
             THEN min(public.normalize_employee_location_key(em.location))
           ELSE NULL
         END
    INTO v_reception_location_key
    FROM public.user_employee_links uel
    JOIN public.employee_master em
      ON upper(btrim(em.employee_code)) = upper(btrim(uel.employee_code))
   WHERE uel.user_id = auth.uid()
     AND uel.is_active = true
     AND em.is_active = true
     AND public.employee_has_business_role(em.role, 'RECEPTION')
     AND public.normalize_employee_location_key(em.location) IS NOT NULL;

  v_reception_location_only :=
    NOT v_is_admin
    AND NOT v_broad_scope
    AND public.has_module_view('reception'::text)
    AND NOT public.has_module_view('service_advisor'::text)
    AND NOT public.has_module_modify('service_advisor'::text)
    AND NOT public.has_module_view('floor_incharge'::text)
    AND NOT public.has_module_view('bodyshop_floor'::text)
    AND NOT public.has_module_modify('bodyshop_floor'::text)
    AND v_reception_location_key IS NOT NULL;

  SELECT coalesce(
    array_agg(DISTINCT upper(btrim(dc))) FILTER (WHERE btrim(coalesce(dc, '')) <> ''),
    ARRAY[]::text[]
  )
    INTO v_dealer_codes
    FROM unnest(public.my_effective_dealer_codes()) AS dc;

  v_reception_dealer_only :=
    NOT v_is_admin
    AND NOT v_reception_location_only
    AND public.has_module_view('reception'::text)
    AND coalesce(array_length(v_dealer_codes, 1), 0) > 0
    AND NOT public.has_module_view('floor_incharge'::text)
    AND NOT public.has_module_view('bodyshop_floor'::text)
    AND NOT public.has_module_modify('bodyshop_floor'::text);

  v_linked_service_floor_fi_only :=
    EXISTS (
      SELECT 1
      FROM public.user_employee_links uel
      JOIN public.employee_master em ON em.employee_code = uel.employee_code
      WHERE uel.user_id = auth.uid()
        AND uel.is_active = true
        AND public.employee_has_business_role(em.role, 'FLOOR_INCHARGE')
        AND upper(replace(btrim(coalesce(em.department, '')), ' ', '')) = 'SERVICE'
        AND NOT public.employee_has_business_role(em.role, 'SA')
    );

  v_use_advisor_own_codes :=
    NOT v_is_admin
    AND NOT v_reception_location_only
    AND NOT v_broad_scope
    AND NOT public.has_module_view('bodyshop_floor'::text)
    AND NOT public.has_module_modify('bodyshop_floor'::text)
    AND NOT v_linked_service_floor_fi_only
    AND EXISTS (
      SELECT 1
      FROM public.user_employee_links uel
      WHERE uel.user_id = auth.uid()
        AND uel.is_active = true
    );

  v_use_floor_incharge_scope :=
    NOT v_is_admin
    AND NOT v_reception_location_only
    AND NOT v_broad_scope
    AND NOT v_reception_dealer_only
    AND NOT v_use_advisor_own_codes
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

  IF v_reception_location_only THEN
    RETURN QUERY
    SELECT r.reg_number, r.created_at
      FROM public.service_reception_entries r
     WHERE r.created_at >= p_since
       AND COALESCE(
             public.normalize_employee_location_key(r.location),
             public.normalize_employee_location_key(r.branch)
           ) = v_reception_location_key
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
         AND public.service_floor_incharge_sa_in_scope(sa.fuel_type, sa.location)
    )
    SELECT r.reg_number, r.created_at
      FROM public.service_reception_entries r
      INNER JOIN allowed_sa a
        ON upper(btrim(r.sa_employee_code)) = a.sa_code
     WHERE r.created_at >= p_since
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

COMMENT ON FUNCTION public.list_reception_reg_created_since(timestamp with time zone) IS
  'DBL-0089: recent Reception registrations use the same one-time RECEPTION location resolution and persisted row location filter as list_reception_entries_page.';
