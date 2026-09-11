-- BUSY-001 / DBL-0044
-- Persist PV/EV Parts lines used by BUSY accounting.
-- Invoice_No and Invoice_Date are mandatory source evidence.
-- They are not BUSY voucher identity; Labour invoice number/date remain final truth.
-- Reversible: DROP FUNCTION public.replace_busy_parts_source; DROP TABLE public.busy_parts;

CREATE TABLE IF NOT EXISTS public.busy_parts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_type text NOT NULL,
  job_card_no text NOT NULL,
  invoice_no text NOT NULL,
  invoice_date date NOT NULL,
  gst_rate numeric,
  net_amount numeric NOT NULL,
  source_row_key text NOT NULL,
  source_file_name text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT busy_parts_source_type_check CHECK (source_type = ANY (ARRAY['PV'::text, 'EV'::text])),
  CONSTRAINT busy_parts_source_row_key_key UNIQUE (source_row_key)
);

COMMENT ON TABLE public.busy_parts IS
  'BUSY Parts PV/EV line store. Replaced per source_type on each /busy upload. Parts invoice_no/invoice_date are source evidence only; Labour remains BUSY voucher identity.';

COMMENT ON COLUMN public.busy_parts.source_type IS 'Upload slot PV or EV. Not a CRM column.';
COMMENT ON COLUMN public.busy_parts.job_card_no IS 'CRM source column: Job Card_No.';
COMMENT ON COLUMN public.busy_parts.invoice_no IS 'CRM source column: Invoice_No. Traceability only. Never overrides Labour invoice_number.';
COMMENT ON COLUMN public.busy_parts.invoice_date IS 'CRM source column: Invoice_Date. Traceability only. Never overrides Labour invoice_date.';
COMMENT ON COLUMN public.busy_parts.gst_rate IS 'Derived from CRM CGST Classification + SGST Classification (or IGST Classification / Tax Amount ÷ Net_Amount).';
COMMENT ON COLUMN public.busy_parts.net_amount IS 'CRM source column: Net_Amount (ex-GST).';
COMMENT ON COLUMN public.busy_parts.source_row_key IS
  'Deterministic dedup key: source_type|JOB_CARD|INVOICE_NO|invoice_date|gst_rate|net_amount|PART#|quantity. Part # and Quantity are used only in the key.';

CREATE INDEX IF NOT EXISTS idx_busy_parts_source_job
  ON public.busy_parts (source_type, job_card_no);

CREATE INDEX IF NOT EXISTS idx_busy_parts_invoice
  ON public.busy_parts (invoice_no, invoice_date);

CREATE TRIGGER trg_busy_parts_updated_at
  BEFORE UPDATE ON public.busy_parts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.busy_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_unrestricted_all_ops_v1 ON public.busy_parts;
CREATE POLICY admin_unrestricted_all_ops_v1 ON public.busy_parts
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS busy_parts_select_rbac_v1 ON public.busy_parts;
CREATE POLICY busy_parts_select_rbac_v1 ON public.busy_parts
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_module_view('busy'));

GRANT SELECT ON TABLE public.busy_parts TO authenticated;
GRANT ALL ON TABLE public.busy_parts TO service_role;
GRANT ALL ON SEQUENCE public.busy_parts_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.busy_parts_id_seq TO service_role;

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
  v_deleted integer := 0;
  v_inserted integer := 0;
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

  DELETE FROM public.busy_parts
  WHERE source_type = p_source_type;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF jsonb_array_length(p_rows) > 0 THEN
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
      rec.job_card_no,
      rec.invoice_no,
      rec.invoice_date,
      rec.gst_rate,
      rec.net_amount,
      rec.source_row_key,
      nullif(btrim(p_source_file_name), ''),
      now()
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
      AND rec.source_row_key IS NOT NULL AND btrim(rec.source_row_key) <> '';
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('deleted', v_deleted, 'inserted', v_inserted);
END;
$$;

COMMENT ON FUNCTION public.replace_busy_parts_source(text, text, jsonb) IS
  'Replace all busy_parts rows for one source_type (PV or EV). Upsert identity is source_row_key.';

GRANT EXECUTE ON FUNCTION public.replace_busy_parts_source(text, text, jsonb) TO authenticated, service_role;
