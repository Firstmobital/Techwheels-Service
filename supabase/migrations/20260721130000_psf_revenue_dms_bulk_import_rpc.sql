-- Fast PSF Revenue DMS import: one DB round-trip per chunk instead of per-row client upserts.
-- Also adds a non-partial UNIQUE constraint so PostgREST upsert can target the business key.

DROP INDEX IF EXISTS public.uq_psf_revenue_dms_location_portal_job_card_invoice_date;

ALTER TABLE public.psf_revenue_dms
  DROP CONSTRAINT IF EXISTS uq_psf_revenue_dms_location_portal_job_card_invoice_date;

ALTER TABLE public.psf_revenue_dms
  ADD CONSTRAINT uq_psf_revenue_dms_location_portal_job_card_invoice_date
  UNIQUE (location, portal, job_card_number, invoice_date);

CREATE OR REPLACE FUNCTION public.run_psf_revenue_dms_import_batch(p_rows jsonb)
RETURNS TABLE(processed_rows integer, inserted_rows integer, updated_rows integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_processed integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;

  ALTER TABLE public.psf_revenue_dms DISABLE TRIGGER trg_refresh_job_card_closed_dms_revenue;

  WITH src AS (
    SELECT
      coalesce(nullif(btrim(r.branch), ''), nullif(btrim(r.location), '')) AS branch,
      nullif(btrim(r.location), '') AS location,
      nullif(btrim(r.portal), '') AS portal,
      nullif(btrim(r.invoice_number), '') AS invoice_number,
      r.invoice_date,
      nullif(btrim(r.account), '') AS account,
      nullif(btrim(r.first_name), '') AS first_name,
      nullif(btrim(r.last_name), '') AS last_name,
      nullif(btrim(r.invoice_type), '') AS invoice_type,
      nullif(btrim(r.invoice_format), '') AS invoice_format,
      nullif(btrim(r.invoice_status), '') AS invoice_status,
      r.final_labour_amount,
      r.final_spares_amount,
      r.total_invoice_amount,
      upper(nullif(btrim(r.job_card_number), '')) AS job_card_number,
      nullif(btrim(r.sr_number), '') AS sr_number,
      upper(nullif(btrim(r.chassis_number), '')) AS chassis_number,
      nullif(btrim(r.vehicle_registration_number), '') AS vehicle_registration_number,
      nullif(btrim(r.irn), '') AS irn,
      r.irn_date,
      nullif(btrim(r.irn_status), '') AS irn_status,
      r.irn_cancellation_date,
      r.tcs_percent,
      r.tcs_assessable_amount,
      r.final_tcs_amount,
      nullif(btrim(r.cancellation_reason), '') AS cancellation_reason,
      nullif(btrim(r.arn), '') AS arn,
      nullif(btrim(r.crn), '') AS crn,
      nullif(btrim(r.contact_home_phone), '') AS contact_home_phone,
      nullif(btrim(r.account_phone_number), '') AS account_phone_number,
      nullif(btrim(r.contact_cell_phone), '') AS contact_cell_phone,
      nullif(btrim(r.contact_work_phone), '') AS contact_work_phone,
      nullif(btrim(r.jc_supervisor), '') AS jc_supervisor,
      r.delivery_date,
      nullif(btrim(r.reason_for_delay), '') AS reason_for_delay,
      nullif(btrim(r.sr_type), '') AS sr_type,
      r.kms_run,
      nullif(btrim(r.sr_assigned_to), '') AS sr_assigned_to,
      nullif(btrim(r.employee_code), '') AS employee_code,
      r.discounts_labour,
      r.other_charges_labour,
      r.service_tax,
      r.swachh_bharat_cess_amount,
      r.krishi_kalyan_cess_amount,
      r.wct,
      r.education_cess,
      r.discounts_parts,
      r.other_charges_parts,
      r.tax_parts,
      nullif(btrim(r.mode_of_payment), '') AS mode_of_payment,
      r.invoice_cancellation_date,
      nullif(btrim(r.prolife_flag), '') AS prolife_flag
    FROM jsonb_to_recordset(p_rows) AS r(
      branch text,
      location text,
      portal text,
      invoice_number text,
      invoice_date date,
      account text,
      first_name text,
      last_name text,
      invoice_type text,
      invoice_format text,
      invoice_status text,
      final_labour_amount numeric,
      final_spares_amount numeric,
      total_invoice_amount numeric,
      job_card_number text,
      sr_number text,
      chassis_number text,
      vehicle_registration_number text,
      irn text,
      irn_date date,
      irn_status text,
      irn_cancellation_date date,
      tcs_percent numeric,
      tcs_assessable_amount numeric,
      final_tcs_amount numeric,
      cancellation_reason text,
      arn text,
      crn text,
      contact_home_phone text,
      account_phone_number text,
      contact_cell_phone text,
      contact_work_phone text,
      jc_supervisor text,
      delivery_date date,
      reason_for_delay text,
      sr_type text,
      kms_run numeric,
      sr_assigned_to text,
      employee_code text,
      discounts_labour numeric,
      other_charges_labour numeric,
      service_tax numeric,
      swachh_bharat_cess_amount numeric,
      krishi_kalyan_cess_amount numeric,
      wct numeric,
      education_cess numeric,
      discounts_parts numeric,
      other_charges_parts numeric,
      tax_parts numeric,
      mode_of_payment text,
      invoice_cancellation_date date,
      prolife_flag text
    )
  ),
  eligible AS (
    SELECT *
    FROM src
    WHERE location IS NOT NULL
      AND portal IS NOT NULL
      AND job_card_number IS NOT NULL
      AND invoice_date IS NOT NULL
      AND branch IS NOT NULL
  ),
  upserted AS (
    INSERT INTO public.psf_revenue_dms AS t (
      branch,
      location,
      portal,
      invoice_number,
      invoice_date,
      account,
      first_name,
      last_name,
      invoice_type,
      invoice_format,
      invoice_status,
      final_labour_amount,
      final_spares_amount,
      total_invoice_amount,
      job_card_number,
      sr_number,
      chassis_number,
      vehicle_registration_number,
      irn,
      irn_date,
      irn_status,
      irn_cancellation_date,
      tcs_percent,
      tcs_assessable_amount,
      final_tcs_amount,
      cancellation_reason,
      arn,
      crn,
      contact_home_phone,
      account_phone_number,
      contact_cell_phone,
      contact_work_phone,
      jc_supervisor,
      delivery_date,
      reason_for_delay,
      sr_type,
      kms_run,
      sr_assigned_to,
      employee_code,
      discounts_labour,
      other_charges_labour,
      service_tax,
      swachh_bharat_cess_amount,
      krishi_kalyan_cess_amount,
      wct,
      education_cess,
      discounts_parts,
      other_charges_parts,
      tax_parts,
      mode_of_payment,
      invoice_cancellation_date,
      prolife_flag
    )
    SELECT
      branch,
      location,
      portal,
      invoice_number,
      invoice_date,
      account,
      first_name,
      last_name,
      invoice_type,
      invoice_format,
      invoice_status,
      final_labour_amount,
      final_spares_amount,
      total_invoice_amount,
      job_card_number,
      sr_number,
      chassis_number,
      vehicle_registration_number,
      irn,
      irn_date,
      irn_status,
      irn_cancellation_date,
      tcs_percent,
      tcs_assessable_amount,
      final_tcs_amount,
      cancellation_reason,
      arn,
      crn,
      contact_home_phone,
      account_phone_number,
      contact_cell_phone,
      contact_work_phone,
      jc_supervisor,
      delivery_date,
      reason_for_delay,
      sr_type,
      kms_run,
      sr_assigned_to,
      employee_code,
      discounts_labour,
      other_charges_labour,
      service_tax,
      swachh_bharat_cess_amount,
      krishi_kalyan_cess_amount,
      wct,
      education_cess,
      discounts_parts,
      other_charges_parts,
      tax_parts,
      mode_of_payment,
      invoice_cancellation_date,
      prolife_flag
    FROM eligible
    ON CONFLICT ON CONSTRAINT uq_psf_revenue_dms_location_portal_job_card_invoice_date
    DO UPDATE SET
      branch = EXCLUDED.branch,
      invoice_number = EXCLUDED.invoice_number,
      account = EXCLUDED.account,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      invoice_type = EXCLUDED.invoice_type,
      invoice_format = EXCLUDED.invoice_format,
      invoice_status = EXCLUDED.invoice_status,
      final_labour_amount = EXCLUDED.final_labour_amount,
      final_spares_amount = EXCLUDED.final_spares_amount,
      total_invoice_amount = EXCLUDED.total_invoice_amount,
      sr_number = EXCLUDED.sr_number,
      chassis_number = EXCLUDED.chassis_number,
      vehicle_registration_number = EXCLUDED.vehicle_registration_number,
      irn = EXCLUDED.irn,
      irn_date = EXCLUDED.irn_date,
      irn_status = EXCLUDED.irn_status,
      irn_cancellation_date = EXCLUDED.irn_cancellation_date,
      tcs_percent = EXCLUDED.tcs_percent,
      tcs_assessable_amount = EXCLUDED.tcs_assessable_amount,
      final_tcs_amount = EXCLUDED.final_tcs_amount,
      cancellation_reason = EXCLUDED.cancellation_reason,
      arn = EXCLUDED.arn,
      crn = EXCLUDED.crn,
      contact_home_phone = EXCLUDED.contact_home_phone,
      account_phone_number = EXCLUDED.account_phone_number,
      contact_cell_phone = EXCLUDED.contact_cell_phone,
      contact_work_phone = EXCLUDED.contact_work_phone,
      jc_supervisor = EXCLUDED.jc_supervisor,
      delivery_date = EXCLUDED.delivery_date,
      reason_for_delay = EXCLUDED.reason_for_delay,
      sr_type = EXCLUDED.sr_type,
      kms_run = EXCLUDED.kms_run,
      sr_assigned_to = EXCLUDED.sr_assigned_to,
      employee_code = EXCLUDED.employee_code,
      discounts_labour = EXCLUDED.discounts_labour,
      other_charges_labour = EXCLUDED.other_charges_labour,
      service_tax = EXCLUDED.service_tax,
      swachh_bharat_cess_amount = EXCLUDED.swachh_bharat_cess_amount,
      krishi_kalyan_cess_amount = EXCLUDED.krishi_kalyan_cess_amount,
      wct = EXCLUDED.wct,
      education_cess = EXCLUDED.education_cess,
      discounts_parts = EXCLUDED.discounts_parts,
      other_charges_parts = EXCLUDED.other_charges_parts,
      tax_parts = EXCLUDED.tax_parts,
      mode_of_payment = EXCLUDED.mode_of_payment,
      invoice_cancellation_date = EXCLUDED.invoice_cancellation_date,
      prolife_flag = EXCLUDED.prolife_flag,
      updated_at = now()
    RETURNING (xmax = 0) AS inserted_flag, job_card_number, location, portal
  )
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE inserted_flag)::integer,
    count(*) FILTER (WHERE NOT inserted_flag)::integer
  INTO v_processed, v_inserted, v_updated
  FROM upserted;

  ALTER TABLE public.psf_revenue_dms ENABLE TRIGGER trg_refresh_job_card_closed_dms_revenue;

  PERFORM public.refresh_job_card_closed_dms_revenue(k.job_card_number, k.location, k.portal)
  FROM (
    SELECT DISTINCT
      upper(btrim(r.job_card_number)) AS job_card_number,
      nullif(btrim(r.location), '') AS location,
      nullif(btrim(r.portal), '') AS portal
    FROM jsonb_to_recordset(p_rows) AS r(
      job_card_number text,
      location text,
      portal text
    )
    WHERE r.job_card_number IS NOT NULL
      AND r.location IS NOT NULL
      AND r.portal IS NOT NULL
  ) k;

  RETURN QUERY SELECT v_processed, v_inserted, v_updated;
EXCEPTION
  WHEN OTHERS THEN
    ALTER TABLE public.psf_revenue_dms ENABLE TRIGGER trg_refresh_job_card_closed_dms_revenue;
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.run_psf_revenue_dms_import_batch(jsonb) IS
  'Bulk upsert psf_revenue_dms from JSON array (Import page). Disables per-row JCC DMS sync trigger during merge; refreshes affected job cards once at end.';

GRANT EXECUTE ON FUNCTION public.run_psf_revenue_dms_import_batch(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_psf_revenue_dms_import_batch(jsonb) TO service_role;
