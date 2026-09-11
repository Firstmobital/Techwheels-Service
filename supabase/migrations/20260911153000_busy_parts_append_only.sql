-- BUSY-001 / DBL-0050
-- Change busy_parts PV/EV upload from replace-all-per-source_type to append-only
-- historical import. Duplicate detection is invoice-level:
--   source_type + invoice_no + invoice_date
-- One invoice may have many Parts line items; do not unique those three columns
-- at row level. Reversible: re-apply 20260911120000 replace_busy_parts_source body.

CREATE INDEX IF NOT EXISTS idx_busy_parts_source_invoice
  ON public.busy_parts (source_type, invoice_no, invoice_date);

COMMENT ON TABLE public.busy_parts IS
  'BUSY Parts PV/EV line store. Append-only on each /busy upload; already-uploaded invoices (source_type + invoice_no + invoice_date) are skipped. Parts invoice_no/invoice_date are source evidence only; Labour remains BUSY voucher identity.';

CREATE OR REPLACE FUNCTION public.replace_busy_parts_source(
  p_source_type text,
  p_source_file_name text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_file text := nullif(btrim(p_source_file_name), '');
  v_new_invoices integer := 0;
  v_skipped_invoices integer := 0;
  v_new_parts_rows integer := 0;
  v_skipped_parts_rows integer := 0;
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('busy')) THEN
    RAISE EXCEPTION 'Permission denied for BUSY Parts persist';
  END IF;

  IF p_source_type NOT IN ('PV', 'EV') THEN
    RAISE EXCEPTION 'Invalid source_type: %. Expected PV or EV.', p_source_type;
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  -- Serialize imports of the same source_type so a concurrent upload cannot
  -- insert a partial invoice, then have a retry skip the missing lines.
  PERFORM pg_advisory_xact_lock(hashtext('busy_parts'), hashtext(p_source_type));

  WITH incoming AS (
    SELECT DISTINCT ON (btrim(rec.source_row_key))
      btrim(rec.job_card_no) AS job_card_no,
      btrim(rec.invoice_no) AS invoice_no,
      rec.invoice_date::date AS invoice_date,
      rec.gst_rate,
      rec.net_amount,
      btrim(rec.source_row_key) AS source_row_key
    FROM jsonb_to_recordset(p_rows) AS rec(
      job_card_no text,
      invoice_no text,
      invoice_date date,
      gst_rate numeric,
      net_amount numeric,
      source_row_key text
    )
    WHERE rec.job_card_no IS NOT NULL AND btrim(rec.job_card_no) <> ''
      AND rec.invoice_no IS NOT NULL AND btrim(rec.invoice_no) <> ''
      AND rec.invoice_date IS NOT NULL
      AND rec.source_row_key IS NOT NULL AND btrim(rec.source_row_key) <> ''
    ORDER BY btrim(rec.source_row_key)
  ),
  classified AS (
    SELECT
      i.*,
      EXISTS (
        SELECT 1
        FROM public.busy_parts bp
        WHERE bp.source_type = p_source_type
          AND upper(btrim(bp.invoice_no)) = upper(i.invoice_no)
          AND bp.invoice_date = i.invoice_date
      ) AS already_uploaded
    FROM incoming i
  ),
  ins AS (
    INSERT INTO public.busy_parts (
      source_type,
      job_card_no,
      invoice_no,
      invoice_date,
      gst_rate,
      net_amount,
      source_row_key,
      source_file_name,
      uploaded_at
    )
    SELECT
      p_source_type,
      c.job_card_no,
      c.invoice_no,
      c.invoice_date,
      c.gst_rate,
      c.net_amount,
      c.source_row_key,
      v_file,
      now()
    FROM classified c
    WHERE NOT c.already_uploaded
    RETURNING 1
  )
  SELECT
    (
      SELECT count(*)::integer
      FROM (SELECT DISTINCT upper(invoice_no), invoice_date FROM classified WHERE NOT already_uploaded) s
    ),
    (
      SELECT count(*)::integer
      FROM (SELECT DISTINCT upper(invoice_no), invoice_date FROM classified WHERE already_uploaded) s
    ),
    (SELECT count(*)::integer FROM classified WHERE NOT already_uploaded),
    (SELECT count(*)::integer FROM classified WHERE already_uploaded)
  INTO
    v_new_invoices,
    v_skipped_invoices,
    v_new_parts_rows,
    v_skipped_parts_rows
  FROM (SELECT count(*) FROM ins) AS inserted;

  RETURN jsonb_build_object(
    'deleted', 0,
    'inserted', v_new_parts_rows,
    'new_invoices', v_new_invoices,
    'new_parts_rows', v_new_parts_rows,
    'skipped_invoices', v_skipped_invoices,
    'skipped_parts_rows', v_skipped_parts_rows
  );
END;
$$;

COMMENT ON FUNCTION public.replace_busy_parts_source(text, text, jsonb) IS
  'Append-only busy_parts import for one source_type (PV or EV). Skips invoices already present for source_type + invoice_no + invoice_date. Inserts every line of a new invoice in the same transaction. Never deletes existing rows.';

GRANT EXECUTE ON FUNCTION public.replace_busy_parts_source(text, text, jsonb) TO authenticated, service_role;
