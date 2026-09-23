-- BUSY-001 / DBL-0083
-- Dealer/account master for Parts-only BUSY invoices, plus Account_Name persistence
-- on busy_parts. Re-import of an already-uploaded invoice still skips new amount
-- rows and only fills account_name / account_code. Never deletes Parts history.
-- Reversible:
--   DROP TRIGGER IF EXISTS trg_busy_parts_account_master_normalize_v1 ON public.busy_parts_account_master;
--   DROP TRIGGER IF EXISTS trg_busy_parts_account_master_updated_at ON public.busy_parts_account_master;
--   DROP FUNCTION IF EXISTS public.busy_parts_account_master_normalize_v1();
--   DROP TABLE IF EXISTS public.busy_parts_account_master;
--   ALTER TABLE public.busy_parts DROP COLUMN IF EXISTS account_name;
--   ALTER TABLE public.busy_parts DROP COLUMN IF EXISTS account_code;
--   Then re-apply supabase/migrations/20260911153000_busy_parts_append_only.sql
--   for replace_busy_parts_source.

CREATE TABLE IF NOT EXISTS public.busy_parts_account_master (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL,
  party_name text NOT NULL,
  gstin text NOT NULL,
  busy_group text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT busy_parts_account_master_code_format
    CHECK (code ~ '^[0-9A-Z]+$'),
  CONSTRAINT busy_parts_account_master_party_name_not_blank
    CHECK (length(btrim(party_name)) > 0),
  CONSTRAINT busy_parts_account_master_busy_group_not_blank
    CHECK (length(btrim(busy_group)) > 0),
  CONSTRAINT busy_parts_account_master_gstin_format
    CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$')
);

COMMENT ON TABLE public.busy_parts_account_master IS
  'BUSY Parts dealer/account mapping. code is the leading token of Parts Account_Name before the first hyphen. party_name, gstin, and busy_group are used only for Parts invoices with no Labour row. Maintained on /busy by admin. Not busy_insurance_master.';

COMMENT ON COLUMN public.busy_parts_account_master.code IS
  'Stable dealer code. Match authority. Example: 3004370 from 3004370-Sv&Pa-Jaipur-PleXav.';
COMMENT ON COLUMN public.busy_parts_account_master.party_name IS
  'BUSY Party Name written to Invoice Vouchers and Party Accounts for a mapped Parts-only invoice.';
COMMENT ON COLUMN public.busy_parts_account_master.gstin IS
  'BUSY GSTIN for that Party Name.';
COMMENT ON COLUMN public.busy_parts_account_master.busy_group IS
  'Exact BUSY Group of Account spelling, including source casing.';

CREATE UNIQUE INDEX IF NOT EXISTS busy_parts_account_master_code_unique
  ON public.busy_parts_account_master (code);

CREATE OR REPLACE FUNCTION public.busy_parts_account_master_normalize_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_code text;
BEGIN
  v_code := upper(regexp_replace(split_part(btrim(coalesce(NEW.code, '')), '-', 1), '\s+', '', 'g'));
  NEW.code := v_code;
  NEW.party_name := btrim(regexp_replace(coalesce(NEW.party_name, ''), '\s+', ' ', 'g'));
  NEW.busy_group := btrim(regexp_replace(coalesce(NEW.busy_group, ''), '\s+', ' ', 'g'));
  NEW.gstin := upper(regexp_replace(coalesce(NEW.gstin, ''), '[\s-]', '', 'g'));

  IF NEW.code !~ '^[0-9A-Z]+$' THEN
    RAISE EXCEPTION 'Dealer code is missing or invalid';
  END IF;
  IF length(NEW.party_name) = 0 THEN
    RAISE EXCEPTION 'Party Name cannot be empty';
  END IF;
  IF length(NEW.busy_group) = 0 THEN
    RAISE EXCEPTION 'BUSY Group of Account cannot be empty';
  END IF;
  IF NEW.gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$' THEN
    RAISE EXCEPTION 'GSTIN is missing or invalid';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_busy_parts_account_master_normalize_v1 ON public.busy_parts_account_master;
CREATE TRIGGER trg_busy_parts_account_master_normalize_v1
  BEFORE INSERT OR UPDATE OF code, party_name, gstin, busy_group
  ON public.busy_parts_account_master
  FOR EACH ROW
  EXECUTE FUNCTION public.busy_parts_account_master_normalize_v1();

DROP TRIGGER IF EXISTS trg_busy_parts_account_master_updated_at ON public.busy_parts_account_master;
CREATE TRIGGER trg_busy_parts_account_master_updated_at
  BEFORE UPDATE ON public.busy_parts_account_master
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.busy_parts_account_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_unrestricted_all_ops_v1 ON public.busy_parts_account_master;
CREATE POLICY admin_unrestricted_all_ops_v1 ON public.busy_parts_account_master
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS busy_parts_account_master_select_rbac_v1 ON public.busy_parts_account_master;
CREATE POLICY busy_parts_account_master_select_rbac_v1 ON public.busy_parts_account_master
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_module_view('busy'));

DROP POLICY IF EXISTS busy_parts_account_master_insert_admin_v1 ON public.busy_parts_account_master;
CREATE POLICY busy_parts_account_master_insert_admin_v1 ON public.busy_parts_account_master
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS busy_parts_account_master_update_admin_v1 ON public.busy_parts_account_master;
CREATE POLICY busy_parts_account_master_update_admin_v1 ON public.busy_parts_account_master
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE ON TABLE public.busy_parts_account_master TO authenticated;
GRANT ALL ON TABLE public.busy_parts_account_master TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.busy_parts_account_master_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.busy_parts_account_master_id_seq TO service_role;

INSERT INTO public.busy_parts_account_master (code, party_name, gstin, busy_group)
SELECT v.code, v.party_name, v.gstin, v.busy_group
FROM (
  VALUES
    ('3080520', 'GANGANAGAR AGENCIES LIMITED', '08AACCG5526C1ZX', 'sundry Creditors'),
    ('3000080', 'AKAR FOURWHEEL PVT LTD', '08AARCA0391G1ZJ', 'DEALER TRANSFER'),
    ('3008660', 'SHREE SHYAM MOTORS', '08ACVFS7188Q1ZL', 'DEALER TRANSFER'),
    ('300A230', 'ROSHAN MOTORS (CARS) PRIVATE LIMITED', '08AALCR4007L1Z4', 'DEALER TRANSFER'),
    ('3004370', 'AUTOPLEX AV', '08ABEFA9249C1ZH', 'DEALER TRANSFER'),
    ('300A150', 'PRATAP NEXGEN CARS PRIVATE LIMITED', '08AANCP2243C1ZL', 'DEALER TRANSFER'),
    ('3083120', 'ORIENTAL AUTOTECH PVT LTD', '08AAACO5495Q1ZM', 'sundry Creditors')
) AS v(code, party_name, gstin, busy_group)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.busy_parts_account_master m
  WHERE m.code = v.code
);

ALTER TABLE public.busy_parts
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS account_code text;

COMMENT ON COLUMN public.busy_parts.account_name IS
  'CRM source column Account_Name, trimmed. Not a voucher identity. Null on rows imported before DBL-0083.';
COMMENT ON COLUMN public.busy_parts.account_code IS
  'Leading token of account_name before the first hyphen, uppercased. Match key for busy_parts_account_master.code. Null when Account_Name was absent.';

COMMENT ON TABLE public.busy_parts IS
  'BUSY Parts PV/EV line store. Append-only on each /busy upload; already-uploaded invoices (source_type + invoice_no + invoice_date) are skipped and are not duplicated. Re-import may fill account_name/account_code on those existing rows. Parts invoice_no/invoice_date are source evidence. Labour remains BUSY voucher identity except a Parts invoice whose account_code is in busy_parts_account_master and has no Labour row.';

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
  v_accounts_refreshed integer := 0;
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

  PERFORM pg_advisory_xact_lock(hashtext('busy_parts'), hashtext(p_source_type));

  WITH incoming AS (
    SELECT DISTINCT ON (btrim(rec.source_row_key))
      btrim(rec.job_card_no) AS job_card_no,
      btrim(rec.invoice_no) AS invoice_no,
      rec.invoice_date::date AS invoice_date,
      rec.gst_rate,
      rec.net_amount,
      btrim(rec.source_row_key) AS source_row_key,
      nullif(btrim(rec.account_name), '') AS account_name,
      CASE
        WHEN upper(regexp_replace(split_part(btrim(coalesce(rec.account_name, '')), '-', 1), '\s+', '', 'g')) ~ '^[0-9A-Z]+$'
          THEN upper(regexp_replace(split_part(btrim(coalesce(rec.account_name, '')), '-', 1), '\s+', '', 'g'))
        WHEN upper(regexp_replace(btrim(coalesce(rec.account_code, '')), '\s+', '', 'g')) ~ '^[0-9A-Z]+$'
          THEN upper(regexp_replace(btrim(coalesce(rec.account_code, '')), '\s+', '', 'g'))
        ELSE NULL
      END AS account_code
    FROM jsonb_to_recordset(p_rows) AS rec(
      job_card_no text,
      invoice_no text,
      invoice_date date,
      gst_rate numeric,
      net_amount numeric,
      source_row_key text,
      account_name text,
      account_code text
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
  refreshed AS (
    UPDATE public.busy_parts bp
    SET
      account_name = COALESCE(c.account_name, bp.account_name),
      account_code = c.account_code
    FROM classified c
    WHERE bp.source_type = p_source_type
      AND bp.source_row_key = c.source_row_key
      AND c.account_code IS NOT NULL
      AND (
        bp.account_name IS DISTINCT FROM COALESCE(c.account_name, bp.account_name)
        OR bp.account_code IS DISTINCT FROM c.account_code
      )
    RETURNING bp.id
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
      uploaded_at,
      account_name,
      account_code
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
      now(),
      c.account_name,
      c.account_code
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
    (SELECT count(*)::integer FROM classified WHERE already_uploaded),
    (SELECT count(*)::integer FROM refreshed)
  INTO
    v_new_invoices,
    v_skipped_invoices,
    v_new_parts_rows,
    v_skipped_parts_rows,
    v_accounts_refreshed
  FROM (SELECT count(*) FROM ins) AS inserted;

  RETURN jsonb_build_object(
    'deleted', 0,
    'inserted', v_new_parts_rows,
    'new_invoices', v_new_invoices,
    'new_parts_rows', v_new_parts_rows,
    'skipped_invoices', v_skipped_invoices,
    'skipped_parts_rows', v_skipped_parts_rows,
    'accounts_refreshed', v_accounts_refreshed
  );
END;
$$;

COMMENT ON FUNCTION public.replace_busy_parts_source(text, text, jsonb) IS
  'Append-only busy_parts import for one source_type (PV or EV). Skips invoices already present for source_type + invoice_no + invoice_date. Inserts every line of a new invoice in the same transaction. On re-import, updates account_name/account_code only when the source_row_key already exists. Never deletes existing rows and never rewrites amounts.';
