-- Missing on tracker: match live cards by DMS job card (not invoice). Invoice is entered late in the pipeline.

CREATE OR REPLACE FUNCTION public.list_bodyshop_dms_missing_on_tracker(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_branch text DEFAULT NULL
)
RETURNS TABLE (
  invoice_number text,
  invoice_date date,
  reg_number text,
  job_card_number text,
  customer_name text,
  total_invoice_amount numeric,
  dms_branch text,
  gap_subclass text,
  live_cards_same_jc integer[],
  live_cards_same_reg integer[],
  invoice_on_jc_card text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
SET row_security TO off
AS $$
BEGIN
  IF NOT (
    public.is_admin()
    OR public.has_module_view('bodyshop_repair')
    OR public.has_module_modify('bodyshop_repair')
    OR public.has_module_view('bodyshop_tracker')
    OR public.has_module_modify('bodyshop_tracker')
    OR public.has_module_view('admin')
    OR public.has_module_modify('admin')
  ) THEN
    RAISE EXCEPTION 'permission denied: requires bodyshop_repair or bodyshop_tracker view'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH month_dms AS (
    SELECT DISTINCT ON (upper(btrim(d.job_card_number)))
           upper(btrim(d.invoice_number)) AS inv,
           upper(btrim(d.job_card_number)) AS jc,
           regexp_replace(upper(coalesce(d.vehicle_registration_number, '')), '[^A-Z0-9]', '', 'g') AS reg_norm,
           nullif(btrim(d.vehicle_registration_number), '') AS raw_reg,
           d.invoice_date AS inv_date,
           d.total_invoice_amount AS amt,
           trim(coalesce(d.first_name, '') || ' ' || coalesce(d.last_name, '')) AS cust,
           coalesce(nullif(btrim(d.location), ''), nullif(btrim(d.branch), '')) AS loc
    FROM public.psf_revenue_dms d
    WHERE d.invoice_date IS NOT NULL
      AND (p_from IS NULL OR d.invoice_date >= p_from)
      AND (p_to IS NULL OR d.invoice_date <= p_to)
      AND d.sr_type = 'Accident'
      AND nullif(btrim(d.job_card_number), '') IS NOT NULL
      AND upper(btrim(d.job_card_number)) ~ '^JC-MBTPLT-JP[12]-[0-9]{4}-[0-9]{6}$'
      AND nullif(btrim(d.invoice_number), '') IS NOT NULL
      AND upper(btrim(d.invoice_number)) ~ '^[IE]MBTAI[0-9]{10}$'
      AND NOT public._bodyshop_dms_invoice_is_cancelled(d.invoice_status)
    ORDER BY upper(btrim(d.job_card_number)), d.invoice_date DESC
  ),
  filtered AS (
    SELECT *
    FROM month_dms m
    WHERE p_branch IS NULL
       OR btrim(p_branch) = ''
       OR lower(btrim(p_branch)) = 'all'
       OR lower(btrim(m.loc)) = lower(btrim(p_branch))
  ),
  missing AS (
    SELECT f.*
    FROM filtered f
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.bodyshop_repair_cards c
      WHERE c.overall_status <> 'cancelled'
        AND upper(btrim(c.job_card_no)) = f.jc
    )
  )
  SELECT
    m.inv::text,
    m.inv_date,
    m.raw_reg::text,
    m.jc::text,
    nullif(m.cust, '')::text,
    m.amt,
    m.loc::text,
    CASE
      WHEN m.reg_norm NOT IN ('', 'AF')
        AND EXISTS (
          SELECT 1 FROM public.bodyshop_repair_cards c
          WHERE c.overall_status <> 'cancelled'
            AND regexp_replace(upper(coalesce(c.reg_number, '')), '[^A-Z0-9]', '', 'g') = m.reg_norm
        ) THEN 't18b'
      ELSE 't18c'
    END::text,
    ARRAY[]::integer[],
    (
      SELECT coalesce(array_agg(c.id ORDER BY c.id), ARRAY[]::integer[])
      FROM public.bodyshop_repair_cards c
      WHERE c.overall_status <> 'cancelled'
        AND m.reg_norm NOT IN ('', 'AF')
        AND regexp_replace(upper(coalesce(c.reg_number, '')), '[^A-Z0-9]', '', 'g') = m.reg_norm
    ),
    (
      SELECT nullif(string_agg(x.inv, ', '), '')
      FROM (
        SELECT DISTINCT upper(btrim(s.invoice_number)) AS inv
        FROM public.bodyshop_repair_cards c
        LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id
        WHERE c.overall_status <> 'cancelled'
          AND m.reg_norm NOT IN ('', 'AF')
          AND regexp_replace(upper(coalesce(c.reg_number, '')), '[^A-Z0-9]', '', 'g') = m.reg_norm
          AND nullif(btrim(s.invoice_number), '') IS NOT NULL
      ) x
    )::text
  FROM missing m
  ORDER BY
    CASE
      WHEN m.reg_norm NOT IN ('', 'AF')
        AND EXISTS (
          SELECT 1 FROM public.bodyshop_repair_cards c
          WHERE c.overall_status <> 'cancelled'
            AND regexp_replace(upper(c.reg_number), '[^A-Z0-9]', '', 'g') = m.reg_norm
        ) THEN 1
      ELSE 2
    END,
    m.inv_date,
    m.jc;
END;
$$;

COMMENT ON FUNCTION public.list_bodyshop_dms_missing_on_tracker(date, date, text) IS
  'DMS Accident rows in period (invoice_date) whose job card is not on any live repair card. Branch = psf_revenue_dms.location. t18b = same reg other card; t18c = no live card for reg.';