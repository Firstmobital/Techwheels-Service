-- v3: refresh_job_card_closed_dms_revenue_batch still timed out because every
-- job_card_closed_data UPDATE fires trg_refresh_all_service_data_from_job_card_closed_data
-- (refresh_all_service_data_from_job_card_closed_data per row). DMS mirror columns
-- do not belong in that sync path.

CREATE OR REPLACE FUNCTION public.refresh_job_card_closed_dms_revenue_batch(p_keys jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

  IF p_keys IS NULL OR jsonb_typeof(p_keys) <> 'array' OR jsonb_array_length(p_keys) = 0 THEN
    RETURN 0;
  END IF;

  ALTER TABLE public.job_card_closed_data
    DISABLE TRIGGER trg_refresh_all_service_data_from_job_card_closed_data;

  WITH keys AS (
    SELECT DISTINCT
      upper(btrim(r.job_card_number)) AS job_card_number,
      nullif(btrim(r.location), '') AS location,
      nullif(btrim(r.portal), '') AS portal
    FROM jsonb_to_recordset(p_keys) AS r(
      job_card_number text,
      location text,
      portal text
    )
    WHERE coalesce(btrim(r.job_card_number), '') <> ''
      AND nullif(btrim(r.location), '') IS NOT NULL
      AND nullif(btrim(r.portal), '') IS NOT NULL
  ),
  latest_dms AS (
    SELECT DISTINCT ON (
      upper(btrim(d.job_card_number)),
      d.location,
      d.portal
    )
      upper(btrim(d.job_card_number)) AS job_card_number,
      d.location,
      d.portal,
      d.final_labour_amount,
      d.total_invoice_amount
    FROM public.psf_revenue_dms d
    INNER JOIN keys k
      ON upper(btrim(d.job_card_number)) = k.job_card_number
     AND d.location = k.location
     AND d.portal = k.portal
    ORDER BY
      upper(btrim(d.job_card_number)),
      d.location,
      d.portal,
      d.invoice_date DESC NULLS LAST,
      d.id DESC
  )
  UPDATE public.job_card_closed_data jc
     SET dms_final_labour_amount = ld.final_labour_amount,
         dms_total_invoice_amount = ld.total_invoice_amount
    FROM latest_dms ld
   WHERE upper(btrim(jc.job_card_number)) = ld.job_card_number
     AND jc.location = ld.location
     AND jc.portal = ld.portal
     AND (
       jc.dms_final_labour_amount IS DISTINCT FROM ld.final_labour_amount
       OR jc.dms_total_invoice_amount IS DISTINCT FROM ld.total_invoice_amount
     );

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  ALTER TABLE public.job_card_closed_data
    ENABLE TRIGGER trg_refresh_all_service_data_from_job_card_closed_data;

  RETURN v_updated;
EXCEPTION
  WHEN OTHERS THEN
    ALTER TABLE public.job_card_closed_data
      ENABLE TRIGGER trg_refresh_all_service_data_from_job_card_closed_data;
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.refresh_job_card_closed_dms_revenue_batch(jsonb) IS
  'Bulk mirror latest psf_revenue_dms into job_card_closed_data.dms_* columns. Skips all_service_data row trigger during update.';
