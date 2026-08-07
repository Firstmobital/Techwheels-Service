-- Fix: statement timeout (57014) on Reception page (list + create/edit).
--
-- The P1-13 SA save fix only addressed Service Advisor job-card UPDATE.
-- Reception still uses direct PostgREST SELECT/INSERT/UPDATE on
-- service_reception_entries as authenticated — expensive multi-policy RLS
-- (~1–4s per statement; audit queryid 852176900607336119 mean 1552ms).
--
-- FIX: SECURITY DEFINER RPCs mirroring reception RLS gates via
-- user_can_read_service_reception_entry / dealer_code_in_scope.

CREATE OR REPLACE FUNCTION public.list_reception_entries_page(
  p_created_at_from       timestamptz,
  p_created_at_to         timestamptz,
  p_page_size             integer     DEFAULT 200,
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
BEGIN
  IF p_created_at_from IS NULL OR p_created_at_to IS NULL THEN
    RAISE EXCEPTION 'created_at range is required'
      USING ERRCODE = '22023';
  END IF;

  v_search := NULLIF(btrim(coalesce(p_search_query, '')), '');

  RETURN QUERY
  SELECT r.*
    FROM public.service_reception_entries r
   WHERE r.created_at >= p_created_at_from
     AND r.created_at <= p_created_at_to
     AND public.user_can_read_service_reception_entry(
           r.dealer_code,
           r.sa_employee_code,
           r.service_type,
           r.id
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
   LIMIT greatest(coalesce(p_page_size, 200), 1);
END;
$$;

COMMENT ON FUNCTION public.list_reception_entries_page(
  timestamptz, timestamptz, integer, timestamptz, bigint, text[], text, boolean
)
IS 'Paginated reception list bypassing authenticated-role RLS (57014). '
   'Uses user_can_read_service_reception_entry for authorization.';

GRANT EXECUTE ON FUNCTION public.list_reception_entries_page(
  timestamptz, timestamptz, integer, timestamptz, bigint, text[], text, boolean
) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_reception_entry(
  p_reg_number        text,
  p_model             text,
  p_service_type      text,
  p_sa_employee_code  text,
  p_owner_name        text,
  p_owner_phone       text,
  p_source            text,
  p_km_reading        integer DEFAULT NULL,
  p_jc_number         text    DEFAULT NULL,
  p_branch            text    DEFAULT NULL
)
RETURNS SETOF public.service_reception_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dealer_code  text;
  v_sa_name      text;
  v_reg_number   text;
  v_service_type text;
BEGIN
  v_dealer_code := public.my_dealer_code();

  IF NOT (
    public.is_admin()
    OR (
      public.has_module_modify('reception')
      AND public.dealer_code_in_scope(v_dealer_code)
    )
  ) THEN
    RAISE EXCEPTION 'permission denied: requires reception modify or admin'
      USING ERRCODE = '42501';
  END IF;

  v_reg_number := upper(btrim(coalesce(p_reg_number, '')));
  v_service_type := NULLIF(btrim(coalesce(p_service_type, '')), '');

  IF v_reg_number = '' THEN
    RAISE EXCEPTION 'registration number is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_model, '')), '') IS NULL THEN
    RAISE EXCEPTION 'model is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_sa_employee_code, '')), '') IS NULL THEN
    RAISE EXCEPTION 'sa employee code is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_owner_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'owner name is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_source, '')), '') IS NULL THEN
    RAISE EXCEPTION 'source is required' USING ERRCODE = '22023';
  END IF;
  IF p_owner_phone IS NULL OR btrim(p_owner_phone) !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'owner phone must be exactly 10 digits' USING ERRCODE = '22023';
  END IF;

  SELECT em.employee_name
    INTO v_sa_name
    FROM public.employee_master em
   WHERE em.employee_code = upper(btrim(p_sa_employee_code));

  IF NOT FOUND OR NULLIF(btrim(coalesce(v_sa_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'employee code % not found', p_sa_employee_code
      USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  INSERT INTO public.service_reception_entries (
    reg_number,
    model,
    service_type,
    sa_employee_code,
    sa_name,
    sa_display_name,
    owner_name,
    owner_phone,
    source,
    km_reading,
    jc_number,
    branch,
    dealer_code
  ) VALUES (
    v_reg_number,
    NULLIF(btrim(p_model), ''),
    v_service_type,
    upper(btrim(p_sa_employee_code)),
    v_sa_name,
    v_sa_name,
    NULLIF(btrim(p_owner_name), ''),
    btrim(p_owner_phone),
    NULLIF(btrim(p_source), ''),
    p_km_reading,
    NULLIF(upper(btrim(coalesce(p_jc_number, ''))), ''),
    NULLIF(btrim(coalesce(p_branch, '')), ''),
    v_dealer_code
  )
  RETURNING *;
END;
$$;

COMMENT ON FUNCTION public.create_reception_entry(
  text, text, text, text, text, text, text, integer, text, text
)
IS 'SECURITY DEFINER RPC: creates a reception intake row. Bypasses authenticated '
   'RLS (57014) while enforcing service_reception_insert_rbac rules.';

GRANT EXECUTE ON FUNCTION public.create_reception_entry(
  text, text, text, text, text, text, text, integer, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_reception_entry(
  p_reception_entry_id bigint,
  p_reg_number         text,
  p_model              text,
  p_service_type       text,
  p_sa_employee_code   text,
  p_owner_name         text,
  p_owner_phone        text,
  p_source             text,
  p_km_reading         integer DEFAULT NULL,
  p_jc_number          text    DEFAULT NULL,
  p_branch             text    DEFAULT NULL
)
RETURNS SETOF public.service_reception_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dealer_code  text;
  v_sa_name      text;
  v_reg_number   text;
  v_service_type text;
BEGIN
  SELECT sre.dealer_code
    INTO v_dealer_code
    FROM public.service_reception_entries sre
   WHERE sre.id = p_reception_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reception entry % not found', p_reception_entry_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.is_admin()
    OR (
      public.has_module_modify('reception')
      AND public.dealer_code_in_scope(v_dealer_code)
    )
  ) THEN
    RAISE EXCEPTION 'permission denied: requires reception modify or admin'
      USING ERRCODE = '42501';
  END IF;

  v_reg_number := upper(btrim(coalesce(p_reg_number, '')));
  v_service_type := NULLIF(btrim(coalesce(p_service_type, '')), '');

  IF v_reg_number = '' THEN
    RAISE EXCEPTION 'registration number is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_model, '')), '') IS NULL THEN
    RAISE EXCEPTION 'model is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_sa_employee_code, '')), '') IS NULL THEN
    RAISE EXCEPTION 'sa employee code is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_owner_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'owner name is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_source, '')), '') IS NULL THEN
    RAISE EXCEPTION 'source is required' USING ERRCODE = '22023';
  END IF;
  IF p_owner_phone IS NULL OR btrim(p_owner_phone) !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'owner phone must be exactly 10 digits' USING ERRCODE = '22023';
  END IF;

  SELECT em.employee_name
    INTO v_sa_name
    FROM public.employee_master em
   WHERE em.employee_code = upper(btrim(p_sa_employee_code));

  IF NOT FOUND OR NULLIF(btrim(coalesce(v_sa_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'employee code % not found', p_sa_employee_code
      USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  UPDATE public.service_reception_entries sre
     SET reg_number       = v_reg_number,
         model            = NULLIF(btrim(p_model), ''),
         service_type     = v_service_type,
         sa_employee_code = upper(btrim(p_sa_employee_code)),
         sa_name          = v_sa_name,
         sa_display_name  = v_sa_name,
         owner_name       = NULLIF(btrim(p_owner_name), ''),
         owner_phone      = btrim(p_owner_phone),
         source           = NULLIF(btrim(p_source), ''),
         km_reading       = p_km_reading,
         jc_number        = NULLIF(upper(btrim(coalesce(p_jc_number, ''))), ''),
         branch           = NULLIF(btrim(coalesce(p_branch, '')), ''),
         updated_at       = now()
   WHERE sre.id = p_reception_entry_id
   RETURNING sre.*;
END;
$$;

COMMENT ON FUNCTION public.update_reception_entry(
  bigint, text, text, text, text, text, text, text, integer, text, text
)
IS 'SECURITY DEFINER RPC: updates a reception intake row. Bypasses authenticated '
   'RLS (57014) while enforcing service_reception_update_rbac rules.';

GRANT EXECUTE ON FUNCTION public.update_reception_entry(
  bigint, text, text, text, text, text, text, text, integer, text, text
) TO authenticated;
