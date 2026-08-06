-- IMPORT-003-P2A: Flag reception rows when reg matches vehicle_updation_data.vehicle_number.

ALTER TABLE public.service_reception_entries
  ADD COLUMN IF NOT EXISTS has_updation_available boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updation_code text,
  ADD COLUMN IF NOT EXISTS updation_name text;

COMMENT ON COLUMN public.service_reception_entries.has_updation_available IS
  'True when reg_number matches a pending updation campaign row in vehicle_updation_data.';
COMMENT ON COLUMN public.service_reception_entries.updation_code IS
  'Campaign code from vehicle_updation_data when has_updation_available is true.';
COMMENT ON COLUMN public.service_reception_entries.updation_name IS
  'Campaign name from vehicle_updation_data when has_updation_available is true.';

CREATE INDEX IF NOT EXISTS idx_sre_has_updation_available
  ON public.service_reception_entries (dealer_code, has_updation_available, created_at DESC)
  WHERE has_updation_available = true;

CREATE OR REPLACE FUNCTION public.lookup_updation_for_reg(
  p_reg_number text,
  p_portal text DEFAULT NULL
)
RETURNS TABLE (
  updation_code text,
  updation_name text,
  portal text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    v.updation_code,
    v.updation_name,
    v.portal
  FROM public.vehicle_updation_data v
  WHERE upper(btrim(v.vehicle_number)) = upper(btrim(p_reg_number))
    AND NULLIF(btrim(v.vehicle_number), '') IS NOT NULL
    AND (
      NULLIF(btrim(p_portal), '') IS NULL
      OR v.portal = p_portal
    )
  ORDER BY v.imported_at DESC, v.id DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.lookup_updation_for_reg(text, text) IS
  'Returns the latest pending updation campaign for a registration number (optional portal filter).';

CREATE OR REPLACE FUNCTION public.get_reception_updation_context(
  p_reg_number text,
  p_portal text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
BEGIN
  IF NULLIF(btrim(p_reg_number), '') IS NULL THEN
    RETURN jsonb_build_object('has_updation_available', false);
  END IF;

  SELECT *
  INTO v_match
  FROM public.lookup_updation_for_reg(p_reg_number, p_portal);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_updation_available', false);
  END IF;

  RETURN jsonb_build_object(
    'has_updation_available', true,
    'updation_code', v_match.updation_code,
    'updation_name', v_match.updation_name,
    'portal', v_match.portal
  );
END;
$$;

COMMENT ON FUNCTION public.get_reception_updation_context(text, text) IS
  'Returns updation campaign context for a registration number at intake time.';

GRANT EXECUTE ON FUNCTION public.get_reception_updation_context(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_updation_available_on_reception()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_match record;
BEGIN
  IF NULLIF(btrim(NEW.reg_number), '') IS NULL THEN
    NEW.has_updation_available := false;
    NEW.updation_code := NULL;
    NEW.updation_name := NULL;
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_match
  FROM public.lookup_updation_for_reg(NEW.reg_number, NEW.portal);

  IF NOT FOUND THEN
    NEW.has_updation_available := false;
    NEW.updation_code := NULL;
    NEW.updation_name := NULL;
    RETURN NEW;
  END IF;

  NEW.has_updation_available := true;
  NEW.updation_code := NULLIF(btrim(v_match.updation_code), '');
  NEW.updation_name := NULLIF(btrim(v_match.updation_name), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_updation_available_on_reception ON public.service_reception_entries;

CREATE TRIGGER trg_apply_updation_available_on_reception
  BEFORE INSERT OR UPDATE OF reg_number, portal
  ON public.service_reception_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_updation_available_on_reception();

CREATE OR REPLACE FUNCTION public.refresh_reception_updation_flags()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cleared integer := 0;
  v_marked integer := 0;
BEGIN
  UPDATE public.service_reception_entries
  SET
    has_updation_available = false,
    updation_code = NULL,
    updation_name = NULL
  WHERE has_updation_available = true
     OR updation_code IS NOT NULL
     OR updation_name IS NOT NULL;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  UPDATE public.service_reception_entries sre
  SET
    has_updation_available = true,
    updation_code = matched.updation_code,
    updation_name = matched.updation_name
  FROM (
    SELECT DISTINCT ON (sre_inner.id)
      sre_inner.id,
      v.updation_code,
      v.updation_name
    FROM public.service_reception_entries sre_inner
    INNER JOIN public.vehicle_updation_data v
      ON upper(btrim(v.vehicle_number)) = upper(btrim(sre_inner.reg_number))
     AND NULLIF(btrim(v.vehicle_number), '') IS NOT NULL
     AND (
       NULLIF(btrim(sre_inner.portal), '') IS NULL
       OR v.portal = sre_inner.portal
     )
    WHERE NULLIF(btrim(sre_inner.reg_number), '') IS NOT NULL
    ORDER BY sre_inner.id, v.imported_at DESC, v.id DESC
  ) matched
  WHERE sre.id = matched.id;

  GET DIAGNOSTICS v_marked = ROW_COUNT;

  RETURN jsonb_build_object(
    'cleared_count', v_cleared,
    'marked_count', v_marked
  );
END;
$$;

COMMENT ON FUNCTION public.refresh_reception_updation_flags() IS
  'Recompute has_updation_available for all reception rows from vehicle_updation_data.';

GRANT EXECUTE ON FUNCTION public.refresh_reception_updation_flags() TO authenticated;

-- Backfill existing reception rows against current vehicle_updation_data.
SELECT public.refresh_reception_updation_flags();

CREATE OR REPLACE FUNCTION public.replace_vehicle_updation_portal(
  p_portal              text,
  p_upload_session_id   uuid,
  p_file_name           text,
  p_sheet_name          text,
  p_uploaded_by_email   text,
  p_skipped_blank_rows  integer,
  p_rows                jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_deleted_count integer := 0;
  v_inserted_count integer := 0;
  v_refresh jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('job_cards')) THEN
    RAISE EXCEPTION 'Permission denied for vehicle updation import';
  END IF;

  IF p_portal NOT IN ('EV', 'PV') THEN
    RAISE EXCEPTION 'Invalid portal: %. Expected EV or PV.', p_portal;
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  DELETE FROM public.vehicle_updation_data
  WHERE portal = p_portal;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  INSERT INTO public.vehicle_updation_uploads (
    portal,
    upload_session_id,
    uploaded_by_email,
    file_name,
    sheet_name,
    row_count,
    skipped_blank_rows
  ) VALUES (
    p_portal,
    p_upload_session_id,
    nullif(btrim(p_uploaded_by_email), ''),
    nullif(btrim(p_file_name), ''),
    nullif(btrim(p_sheet_name), ''),
    coalesce(jsonb_array_length(p_rows), 0),
    coalesce(p_skipped_blank_rows, 0)
  );

  IF jsonb_array_length(p_rows) > 0 THEN
    INSERT INTO public.vehicle_updation_data (
      portal,
      updation_code,
      updation_type,
      updation_name,
      chassis_no,
      model,
      vehicle_number,
      contact_number,
      selling_dealer_code,
      selling_dealer,
      city,
      region,
      zone,
      pcr_no,
      status,
      updation_dealer_code,
      code_chassis_concat,
      campaign_cost,
      fuel_type,
      source_row_number,
      source_file_name,
      upload_session_id,
      source_row_data
    )
    SELECT
      p_portal,
      coalesce(nullif(btrim(r.updation_code), ''), ''),
      nullif(btrim(r.updation_type), ''),
      nullif(btrim(r.updation_name), ''),
      upper(btrim(r.chassis_no)),
      nullif(btrim(r.model), ''),
      nullif(btrim(r.vehicle_number), ''),
      nullif(btrim(r.contact_number), ''),
      nullif(btrim(r.selling_dealer_code), ''),
      nullif(btrim(r.selling_dealer), ''),
      nullif(btrim(r.city), ''),
      nullif(btrim(r.region), ''),
      nullif(btrim(r.zone), ''),
      nullif(btrim(r.pcr_no), ''),
      nullif(btrim(r.status), ''),
      nullif(btrim(r.updation_dealer_code), ''),
      nullif(btrim(r.code_chassis_concat), ''),
      r.campaign_cost,
      nullif(btrim(r.fuel_type), ''),
      r.source_row_number,
      nullif(btrim(r.source_file_name), ''),
      p_upload_session_id,
      coalesce(r.source_row_data, '{}'::jsonb)
    FROM jsonb_to_recordset(p_rows) AS r(
      updation_code text,
      updation_type text,
      updation_name text,
      chassis_no text,
      model text,
      vehicle_number text,
      contact_number text,
      selling_dealer_code text,
      selling_dealer text,
      city text,
      region text,
      zone text,
      pcr_no text,
      status text,
      updation_dealer_code text,
      code_chassis_concat text,
      campaign_cost numeric,
      fuel_type text,
      source_row_number integer,
      source_file_name text,
      source_row_data jsonb
    )
    WHERE nullif(btrim(r.chassis_no), '') IS NOT NULL;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  END IF;

  v_refresh := public.refresh_reception_updation_flags();

  RETURN jsonb_build_object(
    'portal', p_portal,
    'deleted_count', v_deleted_count,
    'inserted_count', v_inserted_count,
    'skipped_blank_rows', coalesce(p_skipped_blank_rows, 0),
    'upload_session_id', p_upload_session_id,
    'reception_flags', v_refresh
  );
END;
$$;
