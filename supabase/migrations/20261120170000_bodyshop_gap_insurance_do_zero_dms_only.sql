-- insurance_do_zero: DMS bill-to matches busy_insurance_master; positive DMS invoice; tracker DO still ₹0 (no claim/card invoice required).

CREATE OR REPLACE FUNCTION public._bodyshop_dms_bill_to_is_insurer(p_account text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO public
AS $$
  SELECT
    nullif(btrim(p_account), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.busy_insurance_master b
      WHERE length(btrim(b.company_name)) > 0
        AND position(lower(btrim(b.company_name)) IN lower(btrim(p_account))) = 1
    );
$$;

COMMENT ON FUNCTION public._bodyshop_dms_bill_to_is_insurer(text) IS
  'True when psf_revenue_dms.account bill-to starts with a busy_insurance_master company_name (insurer DMS invoice).';

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
  tracker_note text,
  dms_owner_phone text,
  dms_portal text,
  dms_sa_employee_code text,
  dms_model_hint text
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
           nullif(btrim(d.account), '') AS dms_account,
           trim(coalesce(d.first_name, '') || ' ' || coalesce(d.last_name, '')) AS cust,
           coalesce(nullif(btrim(d.location), ''), nullif(btrim(d.branch), '')) AS loc,
           public._dms_pick_contact_phone(d.contact_cell_phone, d.contact_home_phone, d.account_phone_number, d.contact_work_phone) AS contact_phone,
           nullif(upper(btrim(d.portal)), '') AS portal,
           nullif(
             upper(btrim(coalesce(nullif(btrim(d.employee_code), ''), nullif(btrim(d.sr_assigned_to), '')))),
             ''
           ) AS emp_code,
           (
             SELECT nullif(btrim(j.product_line), '')
             FROM public.job_card_closed_data j
             WHERE upper(btrim(j.job_card_number)) = upper(btrim(d.job_card_number))
             ORDER BY j.invoice_date DESC NULLS LAST, j.closed_date_time DESC NULLS LAST, j.id DESC
             LIMIT 1
           ) AS model_hint
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
            SELECT 1
            FROM public.bodyshop_repair_cards c
            WHERE c.overall_status <> 'cancelled'
              AND regexp_replace(upper(coalesce(c.reg_number, '')), '[^A-Z0-9]', '', 'g') = m.reg_norm
              AND upper(btrim(c.job_card_no)) <> m.jc
              AND EXISTS (
                SELECT 1
                FROM public.psf_revenue_dms d2
                WHERE upper(btrim(d2.job_card_number)) = upper(btrim(c.job_card_no))
                  AND regexp_replace(upper(coalesce(d2.vehicle_registration_number, '')), '[^A-Z0-9]', '', 'g') = m.reg_norm
                  AND d2.sr_type = 'Accident'
                  AND nullif(btrim(d2.job_card_number), '') IS NOT NULL
                  AND NOT public._bodyshop_dms_invoice_is_cancelled(d2.invoice_status)
              )
          ) THEN 'jc_missing_extra_visit'
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
        CASE
          WHEN m.reg_norm NOT IN ('', 'AF')
            AND EXISTS (
              SELECT 1
              FROM public.bodyshop_repair_cards c
              WHERE c.overall_status <> 'cancelled'
                AND regexp_replace(upper(coalesce(c.reg_number, '')), '[^A-Z0-9]', '', 'g') = m.reg_norm
                AND upper(btrim(c.job_card_no)) <> m.jc
                AND EXISTS (
                  SELECT 1
                  FROM public.psf_revenue_dms d2
                  WHERE upper(btrim(d2.job_card_number)) = upper(btrim(c.job_card_no))
                    AND regexp_replace(upper(coalesce(d2.vehicle_registration_number, '')), '[^A-Z0-9]', '', 'g') = m.reg_norm
                    AND d2.sr_type = 'Accident'
                    AND NOT public._bodyshop_dms_invoice_is_cancelled(d2.invoice_status)
                )
            ) THEN (
              SELECT format(
                'Reg OK — other DMS visit on tracker: card %s · JC %s%s',
                c.id,
                upper(btrim(c.job_card_no)),
                CASE
                  WHEN nullif(btrim(s.invoice_number), '') IS NOT NULL
                  THEN ' · inv ' || upper(btrim(s.invoice_number))
                  ELSE ''
                END
              )
              FROM public.bodyshop_repair_cards c
              LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id
              WHERE c.overall_status <> 'cancelled'
                AND regexp_replace(upper(coalesce(c.reg_number, '')), '[^A-Z0-9]', '', 'g') = m.reg_norm
                AND upper(btrim(c.job_card_no)) <> m.jc
              ORDER BY c.received_at DESC NULLS LAST, c.id DESC
              LIMIT 1
            )
          WHEN m.reg_norm NOT IN ('', 'AF')
            AND EXISTS (
              SELECT 1 FROM public.bodyshop_repair_cards c
              WHERE c.overall_status <> 'cancelled'
                AND regexp_replace(upper(coalesce(c.reg_number, '')), '[^A-Z0-9]', '', 'g') = m.reg_norm
            ) THEN (
              SELECT nullif(string_agg(x.inv, ', '), '')
              FROM (
                SELECT DISTINCT upper(btrim(s.invoice_number)) AS inv
                FROM public.bodyshop_repair_cards c
                LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id
                WHERE c.overall_status <> 'cancelled'
                  AND regexp_replace(upper(coalesce(c.reg_number, '')), '[^A-Z0-9]', '', 'g') = m.reg_norm
                  AND nullif(btrim(s.invoice_number), '') IS NOT NULL
              ) x
            )
          ELSE NULL
        END
      )::text AS tracker_note,
      m.contact_phone::text,
      m.portal::text,
      m.emp_code::text,
      m.model_hint::text
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
      'Accident reception without a repair card'::text,
      CASE
        WHEN length(regexp_replace(coalesce(r.owner_phone, ''), '\D', '', 'g')) >= 10
        THEN right(regexp_replace(coalesce(r.owner_phone, ''), '\D', '', 'g'), 10)
        ELSE NULL
      END::text,
      nullif(upper(btrim(r.portal)), '')::text,
      nullif(upper(btrim(r.sa_employee_code)), '')::text,
      nullif(btrim(r.model), '')::text
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
      ('Card uses placeholder JC “' || c.job_card_no || '”; DMS has ' || d.jc)::text,
      d.contact_phone::text,
      d.portal::text,
      d.emp_code::text,
      d.model_hint::text
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
  invoice_missing AS (
    SELECT
      ('inv-missing:' || d.jc || ':' || d.inv)::text,
      'invoice_missing'::text,
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
        'Card ' || c.id::text || ' has JC; settlement invoice not entered (DMS: ' || d.inv || ')'
      )::text,
      d.contact_phone::text,
      d.portal::text,
      d.emp_code::text,
      d.model_hint::text
    FROM dms_scoped d
    JOIN public.bodyshop_repair_cards c
      ON c.overall_status <> 'cancelled'
      AND upper(btrim(c.job_card_no)) = d.jc
    LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id
    WHERE p_include_invoice_pending
      AND nullif(btrim(s.invoice_number), '') IS NULL
  ),
  invoice_mismatch AS (
    SELECT
      ('inv-mismatch:' || d.jc || ':' || d.inv)::text,
      'invoice_mismatch'::text,
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
        'Card ' || c.id::text || ' invoice '
        || upper(btrim(s.invoice_number))
        || ' does not match DMS '
        || d.inv
      )::text,
      d.contact_phone::text,
      d.portal::text,
      d.emp_code::text,
      d.model_hint::text
    FROM dms_scoped d
    JOIN public.bodyshop_repair_cards c
      ON c.overall_status <> 'cancelled'
      AND upper(btrim(c.job_card_no)) = d.jc
    INNER JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id
    WHERE p_include_invoice_pending
      AND nullif(btrim(s.invoice_number), '') IS NOT NULL
      AND upper(btrim(s.invoice_number)) <> d.inv
  ),
  insurance_do_zero AS (
    SELECT
      ('do-zero:' || d.jc || ':' || c.id::text)::text,
      'insurance_do_zero'::text,
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
        'Card ' || c.id::text
        || ' · DMS bill-to ' || coalesce(d.dms_account, '—')
        || ' · tracker DO ₹0'
        || CASE
             WHEN nullif(btrim(c.claim_intimation_no), '') IS NOT NULL
             THEN ' · claim on card ' || btrim(c.claim_intimation_no)
             ELSE ''
           END
        || CASE
             WHEN nullif(btrim(s.invoice_number), '') IS NULL
             THEN ' · settlement invoice not entered'
             ELSE ''
           END
      )::text,
      d.contact_phone::text,
      d.portal::text,
      d.emp_code::text,
      d.model_hint::text
    FROM dms_scoped d
    JOIN public.bodyshop_repair_cards c
      ON c.overall_status <> 'cancelled'
      AND upper(btrim(c.job_card_no)) = d.jc
    LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id
    WHERE public._bodyshop_dms_bill_to_is_insurer(d.dms_account)
      AND coalesce(d.amt, 0) > 0
      AND coalesce(s.do_amount, c.do_amount, 0) = 0
  )
  SELECT u.*
  FROM (
    SELECT * FROM jc_missing
    UNION ALL SELECT * FROM reception_no_card
    UNION ALL SELECT * FROM placeholder_jc
    UNION ALL SELECT * FROM invoice_missing
    UNION ALL SELECT * FROM invoice_mismatch
    UNION ALL SELECT * FROM insurance_do_zero
  ) u
  ORDER BY
    CASE u.gap_type
      WHEN 'jc_missing' THEN 2
      WHEN 'jc_missing_extra_visit' THEN 2
      WHEN 'jc_missing_same_reg' THEN 3
      WHEN 'reception_no_card' THEN 4
      WHEN 'placeholder_jc' THEN 5
      WHEN 'invoice_missing' THEN 6
      WHEN 'invoice_mismatch' THEN 6
      WHEN 'insurance_do_zero' THEN 7
      ELSE 99
    END,
    u.event_date DESC NULLS LAST,
    u.row_key;
END;
$$;

COMMENT ON FUNCTION public.list_bodyshop_dms_missing_on_tracker(date, date, text, boolean) IS
  'Tracker gaps. insurance_do_zero = DMS bill-to matches busy_insurance_master, DMS amount > 0, card DO still 0 (period = DMS invoice date).';