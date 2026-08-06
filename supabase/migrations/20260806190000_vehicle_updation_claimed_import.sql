-- IMPORT-003-P3: Updation Claimed upload — remove claimed chassis from pending vehicle_updation_data.

ALTER TABLE public.vehicle_updation_uploads
  ADD COLUMN IF NOT EXISTS upload_kind text NOT NULL DEFAULT 'pending';

ALTER TABLE public.vehicle_updation_uploads
  DROP CONSTRAINT IF EXISTS vehicle_updation_uploads_upload_kind_check;

ALTER TABLE public.vehicle_updation_uploads
  ADD CONSTRAINT vehicle_updation_uploads_upload_kind_check
  CHECK (upload_kind IN ('pending', 'claimed'));

COMMENT ON COLUMN public.vehicle_updation_uploads.upload_kind IS
  'pending = full portal replace of vehicle_updation_data; claimed = remove matched chassis from pending list.';

CREATE INDEX IF NOT EXISTS idx_vehicle_updation_uploads_portal_kind_uploaded
  ON public.vehicle_updation_uploads (portal, upload_kind, uploaded_at DESC);

CREATE OR REPLACE FUNCTION public.apply_vehicle_updation_claimed_portal(
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
  v_submitted_count integer := 0;
  v_removed_count integer := 0;
  v_not_found_count integer := 0;
  v_refresh jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('job_cards')) THEN
    RAISE EXCEPTION 'Permission denied for vehicle updation claimed import';
  END IF;

  IF p_portal NOT IN ('EV', 'PV') THEN
    RAISE EXCEPTION 'Invalid portal: %. Expected EV or PV.', p_portal;
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  v_submitted_count := coalesce(jsonb_array_length(p_rows), 0);

  INSERT INTO public.vehicle_updation_uploads (
    portal,
    upload_kind,
    upload_session_id,
    uploaded_by_email,
    file_name,
    sheet_name,
    row_count,
    skipped_blank_rows
  ) VALUES (
    p_portal,
    'claimed',
    p_upload_session_id,
    nullif(btrim(p_uploaded_by_email), ''),
    nullif(btrim(p_file_name), ''),
    nullif(btrim(p_sheet_name), ''),
    v_submitted_count,
    coalesce(p_skipped_blank_rows, 0)
  );

  IF v_submitted_count > 0 THEN
    WITH claimed AS (
      SELECT DISTINCT upper(btrim(r.chassis_no)) AS chassis_norm
      FROM jsonb_to_recordset(p_rows) AS r(
        chassis_no text,
        source_row_number integer,
        source_file_name text,
        source_row_data jsonb
      )
      WHERE nullif(btrim(r.chassis_no), '') IS NOT NULL
    ),
    deleted AS (
      DELETE FROM public.vehicle_updation_data v
      USING claimed c
      WHERE v.portal = p_portal
        AND upper(btrim(v.chassis_no)) = c.chassis_norm
      RETURNING upper(btrim(v.chassis_no)) AS chassis_norm
    )
    SELECT
      (SELECT COUNT(*) FROM claimed),
      (SELECT COUNT(*) FROM deleted),
      (
        SELECT COUNT(*)
        FROM claimed c
        WHERE NOT EXISTS (
          SELECT 1
          FROM deleted d
          WHERE d.chassis_norm = c.chassis_norm
        )
      )
    INTO v_submitted_count, v_removed_count, v_not_found_count;
  END IF;

  v_refresh := public.refresh_reception_updation_flags();

  RETURN jsonb_build_object(
    'portal', p_portal,
    'submitted_count', v_submitted_count,
    'removed_count', v_removed_count,
    'not_found_count', v_not_found_count,
    'skipped_blank_rows', coalesce(p_skipped_blank_rows, 0),
    'upload_session_id', p_upload_session_id,
    'reception_flags', v_refresh
  );
END;
$$;

COMMENT ON FUNCTION public.apply_vehicle_updation_claimed_portal(text, uuid, text, text, text, integer, jsonb) IS
  'Remove claimed updation chassis numbers from pending vehicle_updation_data for one portal and refresh reception flags.';

GRANT EXECUTE ON FUNCTION public.apply_vehicle_updation_claimed_portal(text, uuid, text, text, text, integer, jsonb)
  TO authenticated;

-- Ensure pending imports are tagged explicitly going forward.
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
    upload_kind,
    upload_session_id,
    uploaded_by_email,
    file_name,
    sheet_name,
    row_count,
    skipped_blank_rows
  ) VALUES (
    p_portal,
    'pending',
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
