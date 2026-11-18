-- Repair Tracker "Missing on tracker": union of gap types (JC missing, reception, placeholder, optional invoice pending).

DROP FUNCTION IF EXISTS public.list_bodyshop_dms_missing_on_tracker(date, date, text);

CREATE OR REPLACE FUNCTION public.list_bodyshop_dms_missing_on_tracker(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_branch text DEFAULT NULL,
  p_include_invoice_pending boolean DEFAULT false
)
RETURNS TABLE (
  row_key text,
  gap_type text,
  period_basis text,
  event_date date,
  invoice_number text,
  reg_number text,
  job_card_number text,
  customer_name text,
  total_invoice_amount numeric,
  dms_branch text,
  tracker_card_ids integer[],
  reception_entry_id bigint,
  tracker_note text
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
  WITH dms_rows AS (
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
  dms_scoped AS (
    SELECT *
    FROM dms_rows d
    WHERE p_branch IS NULL
       OR btrim(p_branch) = ''
       OR lower(btrim(p_branch)) = 'all'
       OR lower(btrim(d.loc)) = lower(btrim(p_branch))
  ),
  jc_missing AS (
    SELECT
      ('jc:' || m.jc)::text AS row_key,
      CASE
        WHEN m.reg_norm NOT IN ('', 'AF')
          AND EXISTS (
            SELECT 1 FROM public.bodyshop_repair_cards c
            WHERE c.overall_status <> 'cancelled'
              AND regexp_replace(upper(coalesce(c.reg_number, '')), '[^A-Z0-9]', '', 'g') = m.reg_norm
          ) THEN 'jc_missing_same_reg'
        ELSE 'jc_missing'
      END::text AS gap_type,
      'dms_invoice'::text AS period_basis,
      m.inv_date AS event_date,
      m.inv::text,
      m.raw_reg::text,
      m.jc::text,
      nullif(m.cust, '')::text,
      m.amt,
      m.loc::text,
      (
        SELECT coalesce(array_agg(c.id ORDER BY c.id), ARRAY[]::integer[])
        FROM public.bodyshop_repair_cards c
        WHERE c.overall_status <> 'cancelled'
          AND m.reg_norm NOT IN ('', 'AF')
          AND regexp_replace(upper(coalesce(c.reg_number, '')), '[^A-Z0-9]', '', 'g') = m.reg_norm
      ) AS tracker_card_ids,
      NULL::bigint AS reception_entry_id,
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
      )::text AS tracker_note
    FROM dms_scoped m
    WHERE NOT EXISTS (
      SELECT 1 FROM public.bodyshop_repair_cards c
      WHERE c.overall_status <> 'cancelled'
        AND upper(btrim(c.job_card_no)) = m.jc
    )
  ),
  reception_no_card AS (
    SELECT
      ('rec:' || r.id)::text,
      'reception_no_card'::text,
      'reception'::text,
      (r.created_at AT TIME ZONE 'Asia/Kolkata')::date,
      NULL::text,
      r.reg_number::text,
      nullif(btrim(r.jc_number), '')::text,
      nullif(btrim(coalesce(r.owner_name, r.sa_display_name, r.sa_name, '')), '')::text,
      NULL::numeric,
      coalesce(nullif(btrim(r.branch), ''), nullif(btrim(r.location), ''))::text,
      ARRAY[]::integer[],
      r.id,
      'Accident reception without a repair card'::text
    FROM public.service_reception_entries r
    WHERE r.service_type = 'Accident'
      AND (p_from IS NULL OR (r.created_at AT TIME ZONE 'Asia/Kolkata')::date >= p_from)
      AND (p_to IS NULL OR (r.created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_to)
      AND NOT EXISTS (
        SELECT 1 FROM public.bodyshop_repair_cards c
        WHERE c.reception_entry_id = r.id
      )
      AND (
        p_branch IS NULL OR btrim(p_branch) = '' OR lower(btrim(p_branch)) = 'all'
        OR lower(btrim(coalesce(r.branch, r.location, ''))) = lower(btrim(p_branch))
      )
  ),
  placeholder_jc AS (
    SELECT DISTINCT ON (c.id, d.jc)
      ('ph:' || c.id::text || ':' || d.jc)::text,
      'placeholder_jc'::text,
      'dms_invoice'::text,
      d.inv_date,
      d.inv::text,
      c.reg_number::text,
      d.jc::text,
      nullif(coalesce(c.customer_name, d.cust), '')::text,
      d.amt,
      d.loc::text,
      ARRAY[c.id]::integer[],
      c.reception_entry_id,
      ('Card uses placeholder JC “' || c.job_card_no || '”; DMS has ' || d.jc)::text
    FROM dms_scoped d
    JOIN public.bodyshop_repair_cards c
      ON c.overall_status <> 'cancelled'
      AND d.reg_norm NOT IN ('', 'AF')
      AND regexp_replace(upper(coalesce(c.reg_number, '')), '[^A-Z0-9]', '', 'g') = d.reg_norm
      AND (
        upper(btrim(c.job_card_no)) = regexp_replace(upper(coalesce(c.reg_number, '')), '[^A-Z0-9]', '', 'g')
        OR upper(btrim(c.job_card_no)) = upper(btrim(c.reg_number))
      )
      AND upper(btrim(c.job_card_no)) <> d.jc
    WHERE NOT EXISTS (
      SELECT 1 FROM public.bodyshop_repair_cards o
      WHERE o.overall_status <> 'cancelled'
        AND upper(btrim(o.job_card_no)) = d.jc
        AND o.id <> c.id
    )
    ORDER BY c.id, d.jc, d.inv_date DESC
  ),
  invoice_pending AS (
    SELECT
      ('inv:' || d.jc || ':' || d.inv)::text,
      'invoice_pending'::text,
      'dms_invoice'::text,
      d.inv_date,
      d.inv::text,
      d.raw_reg::text,
      d.jc::text,
      nullif(d.cust, '')::text,
      d.amt,
      d.loc::text,
      ARRAY[c.id]::integer[],
      c.reception_entry_id,
      (
        'Card ' || c.id::text || ' has JC; invoice on card: '
        || coalesce(upper(btrim(s.invoice_number)), '(blank)')
      )::text
    FROM dms_scoped d
    JOIN public.bodyshop_repair_cards c
      ON c.overall_status <> 'cancelled'
      AND upper(btrim(c.job_card_no)) = d.jc
    LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id
    WHERE p_include_invoice_pending
      AND (
        nullif(btrim(s.invoice_number), '') IS NULL
        OR upper(btrim(s.invoice_number)) <> d.inv
      )
  )
  SELECT u.*
  FROM (
    SELECT * FROM jc_missing
    UNION ALL SELECT * FROM reception_no_card
    UNION ALL SELECT * FROM placeholder_jc
    UNION ALL SELECT * FROM invoice_pending
  ) u
  ORDER BY
    CASE u.gap_type
      WHEN 'reception_no_card' THEN 1
      WHEN 'jc_missing' THEN 2
      WHEN 'jc_missing_same_reg' THEN 3
      WHEN 'placeholder_jc' THEN 4
      WHEN 'invoice_pending' THEN 5
      ELSE 9
    END,
    u.event_date NULLS LAST,
    u.row_key;
END;
$$;

COMMENT ON FUNCTION public.list_bodyshop_dms_missing_on_tracker(date, date, text, boolean) IS
  'Tracker gap list: jc_missing*, reception_no_card, placeholder_jc, optional invoice_pending. DMS rows use invoice_date; reception uses created_at (IST).';

REVOKE ALL ON FUNCTION public.list_bodyshop_dms_missing_on_tracker(date, date, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_bodyshop_dms_missing_on_tracker(date, date, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_bodyshop_dms_missing_on_tracker(date, date, text, boolean) TO service_role;