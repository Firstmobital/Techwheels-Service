-- Repair Tracker KPI: DMS accident invoices (not cancelled) with no matching invoice on a live bodyshop card.

CREATE OR REPLACE FUNCTION public._bodyshop_dms_invoice_is_cancelled(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(lower(btrim(p_status)), '') LIKE '%cancel%';
$$;

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
    SELECT DISTINCT ON (upper(btrim(d.invoice_number)))
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
      AND nullif(btrim(d.invoice_number), '') IS NOT NULL
      AND upper(btrim(d.invoice_number)) ~ '^[IE]MBTAI[0-9]{10}$'
      AND NOT public._bodyshop_dms_invoice_is_cancelled(d.invoice_status)
    ORDER BY upper(btrim(d.invoice_number)), d.invoice_date DESC
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
      FROM public.bodyshop_settlements s
      JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
      WHERE c.overall_status <> 'cancelled'
        AND upper(btrim(s.invoice_number)) = f.inv
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
      WHEN EXISTS (
        SELECT 1 FROM public.bodyshop_repair_cards c
        WHERE c.overall_status <> 'cancelled' AND upper(btrim(c.job_card_no)) = m.jc
      ) THEN 't18a'
      WHEN EXISTS (
        SELECT 1 FROM public.bodyshop_repair_cards c
        WHERE c.overall_status <> 'cancelled'
          AND regexp_replace(upper(coalesce(c.reg_number, '')), '[^A-Z0-9]', '', 'g') = m.reg_norm
      ) THEN 't18b'
      ELSE 't18c'
    END::text,
    (
      SELECT coalesce(array_agg(c.id ORDER BY c.id), ARRAY[]::integer[])
      FROM public.bodyshop_repair_cards c
      WHERE c.overall_status <> 'cancelled' AND upper(btrim(c.job_card_no)) = m.jc
    ),
    (
      SELECT coalesce(array_agg(c.id ORDER BY c.id), ARRAY[]::integer[])
      FROM public.bodyshop_repair_cards c
      WHERE c.overall_status <> 'cancelled'
        AND regexp_replace(upper(coalesce(c.reg_number, '')), '[^A-Z0-9]', '', 'g') = m.reg_norm
    ),
    (
      SELECT upper(btrim(s.invoice_number))
      FROM public.bodyshop_settlements s
      JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
      WHERE c.overall_status <> 'cancelled'
        AND upper(btrim(c.job_card_no)) = m.jc
      ORDER BY s.updated_at DESC NULLS LAST
      LIMIT 1
    )::text
  FROM missing m
  ORDER BY
    CASE
      WHEN EXISTS (SELECT 1 FROM public.bodyshop_repair_cards c WHERE c.overall_status <> 'cancelled' AND upper(btrim(c.job_card_no)) = m.jc) THEN 1
      WHEN EXISTS (SELECT 1 FROM public.bodyshop_repair_cards c WHERE c.overall_status <> 'cancelled'
          AND regexp_replace(upper(c.reg_number), '[^A-Z0-9]', '', 'g') = m.reg_norm) THEN 2
      ELSE 3
    END,
    m.inv_date,
    m.inv;
END;
$$;

COMMENT ON FUNCTION public.list_bodyshop_dms_missing_on_tracker(date, date, text) IS
  'DMS Accident invoices in period (invoice_date) not on any live bodyshop card. Optional branch matches psf_revenue_dms.location. Gap subclasses t18a/t18b/t18c.';

REVOKE ALL ON FUNCTION public.list_bodyshop_dms_missing_on_tracker(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_bodyshop_dms_missing_on_tracker(date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_bodyshop_dms_missing_on_tracker(date, date, text) TO service_role;