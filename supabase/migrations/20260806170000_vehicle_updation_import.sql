-- IMPORT-003: Vehicle Updation master data — portal-scoped replace-all import (EV / PV).

CREATE TABLE public.vehicle_updation_data (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal                  TEXT NOT NULL,
  updation_code           TEXT NOT NULL DEFAULT '',
  updation_type           TEXT,
  updation_name           TEXT,
  chassis_no              TEXT NOT NULL,
  model                   TEXT,
  vehicle_number          TEXT,
  contact_number          TEXT,
  selling_dealer_code     TEXT,
  selling_dealer          TEXT,
  city                    TEXT,
  region                  TEXT,
  zone                    TEXT,
  pcr_no                  TEXT,
  status                  TEXT,
  updation_dealer_code    TEXT,
  code_chassis_concat     TEXT,
  campaign_cost           NUMERIC,
  fuel_type               TEXT,
  source_row_number       INTEGER,
  source_file_name        TEXT,
  upload_session_id       UUID NOT NULL,
  source_row_data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_updation_data_portal_check CHECK (portal IN ('EV', 'PV')),
  CONSTRAINT vehicle_updation_data_portal_chassis_code_key
    UNIQUE (portal, chassis_no, updation_code)
);

CREATE INDEX idx_vehicle_updation_portal
  ON public.vehicle_updation_data (portal);

CREATE INDEX idx_vehicle_updation_chassis_norm
  ON public.vehicle_updation_data (upper(btrim(chassis_no)));

CREATE INDEX idx_vehicle_updation_reg_norm
  ON public.vehicle_updation_data (upper(btrim(vehicle_number)));

CREATE INDEX idx_vehicle_updation_session
  ON public.vehicle_updation_data (upload_session_id);

CREATE INDEX idx_vehicle_updation_code
  ON public.vehicle_updation_data (updation_code);

COMMENT ON TABLE public.vehicle_updation_data IS
  'Master pending Tata Motors updation campaign list per portal (EV/PV). Replaced entirely on each portal import.';

CREATE TRIGGER trg_vehicle_updation_updated_at
  BEFORE UPDATE ON public.vehicle_updation_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.vehicle_updation_uploads (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal              TEXT NOT NULL,
  upload_session_id   UUID NOT NULL UNIQUE,
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by_email   TEXT,
  file_name           TEXT,
  sheet_name          TEXT,
  row_count           INTEGER NOT NULL DEFAULT 0,
  skipped_blank_rows  INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT vehicle_updation_uploads_portal_check CHECK (portal IN ('EV', 'PV'))
);

COMMENT ON TABLE public.vehicle_updation_uploads IS
  'One row per Vehicle Updation portal import on /import.';

CREATE INDEX idx_vehicle_updation_uploads_portal_uploaded
  ON public.vehicle_updation_uploads (portal, uploaded_at DESC);

ALTER TABLE public.vehicle_updation_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_updation_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all ON public.vehicle_updation_data
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY vu_data_select_rbac ON public.vehicle_updation_data
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_module_view('job_cards'));

CREATE POLICY vu_data_insert_rbac ON public.vehicle_updation_data
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.has_module_modify('job_cards'));

CREATE POLICY vu_data_delete_rbac ON public.vehicle_updation_data
  FOR DELETE TO authenticated
  USING (public.is_admin() OR public.has_module_delete('job_cards'));

CREATE POLICY admin_all_uploads ON public.vehicle_updation_uploads
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY vu_uploads_select_rbac ON public.vehicle_updation_uploads
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_module_view('job_cards'));

CREATE POLICY vu_uploads_insert_rbac ON public.vehicle_updation_uploads
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.has_module_modify('job_cards'));

GRANT SELECT, INSERT, DELETE ON public.vehicle_updation_data TO authenticated;
GRANT SELECT, INSERT ON public.vehicle_updation_uploads TO authenticated;
GRANT ALL ON public.vehicle_updation_data TO service_role;
GRANT ALL ON public.vehicle_updation_uploads TO service_role;

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

  RETURN jsonb_build_object(
    'portal', p_portal,
    'deleted_count', v_deleted_count,
    'inserted_count', v_inserted_count,
    'skipped_blank_rows', coalesce(p_skipped_blank_rows, 0),
    'upload_session_id', p_upload_session_id
  );
END;
$$;

COMMENT ON FUNCTION public.replace_vehicle_updation_portal(text, uuid, text, text, text, integer, jsonb) IS
  'Atomically replace all vehicle_updation_data rows for one portal and record upload metadata.';

GRANT EXECUTE ON FUNCTION public.replace_vehicle_updation_portal(text, uuid, text, text, text, integer, jsonb)
  TO authenticated;
