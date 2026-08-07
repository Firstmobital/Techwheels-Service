-- P1-13 complete: remaining service_reception_entries RLS bypass RPCs.
--
-- Prior slices (apply in order if not yet deployed):
--   20260807120000 — SA save + sync trigger
--   20260807130000 — reception list/create/update
--
-- This migration finishes the family so no hot path uses direct PostgREST
-- SELECT/INSERT/UPDATE on service_reception_entries as authenticated.

CREATE OR REPLACE FUNCTION public.get_reception_entry_by_id(p_reception_entry_id bigint)
RETURNS SETOF public.service_reception_entries
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT r.*
    FROM public.service_reception_entries r
   WHERE r.id = p_reception_entry_id
     AND public.user_can_read_service_reception_entry(
           r.dealer_code,
           r.sa_employee_code,
           r.service_type,
           r.id
         );
END;
$$;

COMMENT ON FUNCTION public.get_reception_entry_by_id(bigint)
IS 'Single-row reception read bypassing authenticated RLS (57014).';

GRANT EXECUTE ON FUNCTION public.get_reception_entry_by_id(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_reception_entry_latest_by_reg(p_reg_number text)
RETURNS SETOF public.service_reception_entries
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reg text;
BEGIN
  v_reg := upper(btrim(coalesce(p_reg_number, '')));
  IF v_reg = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.*
    FROM public.service_reception_entries r
   WHERE upper(btrim(r.reg_number)) = v_reg
     AND public.user_can_read_service_reception_entry(
           r.dealer_code,
           r.sa_employee_code,
           r.service_type,
           r.id
         )
   ORDER BY r.created_at DESC, r.id DESC
   LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_reception_entry_latest_by_reg(text)
IS 'Latest reception row for a reg number; bypasses authenticated RLS.';

GRANT EXECUTE ON FUNCTION public.get_reception_entry_latest_by_reg(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_reception_entries_by_jc_numbers(p_jc_numbers text[])
RETURNS SETOF public.service_reception_entries
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_jc_numbers IS NULL OR cardinality(p_jc_numbers) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.*
    FROM public.service_reception_entries r
   WHERE upper(btrim(r.jc_number)) = ANY (
           SELECT upper(btrim(jc))
             FROM unnest(p_jc_numbers) AS jc
            WHERE NULLIF(btrim(jc), '') IS NOT NULL
         )
     AND public.user_can_read_service_reception_entry(
           r.dealer_code,
           r.sa_employee_code,
           r.service_type,
           r.id
         )
   ORDER BY r.created_at DESC, r.id DESC;
END;
$$;

COMMENT ON FUNCTION public.list_reception_entries_by_jc_numbers(text[])
IS 'JC-scoped reception lookup bypassing authenticated RLS.';

GRANT EXECUTE ON FUNCTION public.list_reception_entries_by_jc_numbers(text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.service_advisor_mark_invoice_done(p_reception_entry_id bigint)
RETURNS SETOF public.service_reception_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sa_employee_code text;
  v_is_admin         boolean;
  v_has_sa_modify    boolean;
  v_done_by          text;
BEGIN
  v_is_admin      := public.is_admin();
  v_has_sa_modify := public.has_module_modify('service_advisor');

  IF NOT (v_is_admin OR v_has_sa_modify) THEN
    RAISE EXCEPTION 'permission denied: requires service_advisor modify or admin'
      USING ERRCODE = '42501';
  END IF;

  SELECT sre.sa_employee_code
    INTO v_sa_employee_code
    FROM public.service_reception_entries sre
   WHERE sre.id = p_reception_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reception entry % not found', p_reception_entry_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_is_admin THEN
    IF v_sa_employee_code IS NULL
       OR NOT public.user_has_employee_code(v_sa_employee_code)
    THEN
      RAISE EXCEPTION 'permission denied: caller is not the SA on this reception entry'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_done_by := coalesce(
    nullif(btrim(auth.jwt() ->> 'email'), ''),
    auth.uid()::text,
    'system'
  );

  RETURN QUERY
  UPDATE public.service_reception_entries sre
     SET invoice_done_at = now(),
         invoice_done_by = v_done_by,
         updated_at = now()
   WHERE sre.id = p_reception_entry_id
   RETURNING sre.*;
END;
$$;

COMMENT ON FUNCTION public.service_advisor_mark_invoice_done(bigint)
IS 'SECURITY DEFINER: mark SA invoice done without authenticated RLS overhead.';

GRANT EXECUTE ON FUNCTION public.service_advisor_mark_invoice_done(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.bulk_create_reception_entries(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dealer_code text;
  v_row         jsonb;
  v_count       integer := 0;
  v_sa_name     text;
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

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN 0;
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    SELECT em.employee_name
      INTO v_sa_name
      FROM public.employee_master em
     WHERE em.employee_code = upper(btrim(v_row ->> 'sa_employee_code'));

    IF NOT FOUND OR NULLIF(btrim(coalesce(v_sa_name, '')), '') IS NULL THEN
      CONTINUE;
    END IF;

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
      upper(btrim(coalesce(v_row ->> 'reg_number', ''))),
      NULLIF(btrim(coalesce(v_row ->> 'model', '')), ''),
      NULLIF(btrim(coalesce(v_row ->> 'service_type', '')), ''),
      upper(btrim(coalesce(v_row ->> 'sa_employee_code', ''))),
      v_sa_name,
      v_sa_name,
      NULLIF(btrim(coalesce(v_row ->> 'owner_name', '')), ''),
      btrim(coalesce(v_row ->> 'owner_phone', '')),
      NULLIF(btrim(coalesce(v_row ->> 'source', '')), ''),
      NULLIF(v_row ->> 'km_reading', '')::integer,
      NULLIF(upper(btrim(coalesce(v_row ->> 'jc_number', ''))), ''),
      NULLIF(btrim(coalesce(v_row ->> 'branch', '')), ''),
      v_dealer_code
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.bulk_create_reception_entries(jsonb)
IS 'Bulk reception import bypassing authenticated RLS (57014 on multi-row INSERT).';

GRANT EXECUTE ON FUNCTION public.bulk_create_reception_entries(jsonb) TO authenticated;

-- Extend create/update with optional portal (mobile EV/PV intake).
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
  p_branch            text    DEFAULT NULL,
  p_portal            text    DEFAULT NULL
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
  v_portal       text;
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
  v_portal := NULLIF(upper(btrim(coalesce(p_portal, ''))), '');

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
  IF v_portal IS NOT NULL AND v_portal NOT IN ('EV', 'PV') THEN
    RAISE EXCEPTION 'portal must be EV or PV' USING ERRCODE = '22023';
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
    portal,
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
    v_portal,
    v_dealer_code
  )
  RETURNING *;
END;
$$;

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
  p_branch             text    DEFAULT NULL,
  p_portal             text    DEFAULT NULL
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
  v_portal       text;
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
  v_portal := NULLIF(upper(btrim(coalesce(p_portal, ''))), '');

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
  IF v_portal IS NOT NULL AND v_portal NOT IN ('EV', 'PV') THEN
    RAISE EXCEPTION 'portal must be EV or PV' USING ERRCODE = '22023';
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
         portal           = COALESCE(v_portal, sre.portal),
         updated_at       = now()
   WHERE sre.id = p_reception_entry_id
   RETURNING sre.*;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_reception_entry(
  text, text, text, text, text, text, text, integer, text, text, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_reception_entry(
  bigint, text, text, text, text, text, text, text, integer, text, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_reception_reg_numbers(
  p_prefix text,
  p_limit  integer DEFAULT 8
)
RETURNS TABLE(reg_number text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prefix text;
  v_limit  integer;
BEGIN
  v_prefix := upper(btrim(coalesce(p_prefix, '')));
  v_limit := greatest(coalesce(p_limit, 8), 1);

  IF v_prefix = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT r.reg_number
    FROM public.service_reception_entries r
   WHERE upper(r.reg_number) LIKE v_prefix || '%'
     AND public.user_can_read_service_reception_entry(
           r.dealer_code,
           r.sa_employee_code,
           r.service_type,
           r.id
         )
   ORDER BY 1
   LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.search_reception_reg_numbers(text, integer)
IS 'Reg-number autocomplete bypassing authenticated RLS.';

GRANT EXECUTE ON FUNCTION public.search_reception_reg_numbers(text, integer) TO authenticated;
