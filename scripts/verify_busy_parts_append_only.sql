-- Isolated proof of DBL-0050 append-only invoice import.
-- Does not touch public.busy_parts. Safe to run in any Postgres session.
-- Run: psql -v ON_ERROR_STOP=1 -f scripts/verify_busy_parts_append_only.sql

BEGIN;

CREATE TEMP TABLE busy_parts_sim (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_type text NOT NULL,
  job_card_no text NOT NULL,
  invoice_no text NOT NULL,
  invoice_date date NOT NULL,
  gst_rate numeric,
  net_amount numeric NOT NULL,
  source_row_key text NOT NULL UNIQUE
);

CREATE TEMP TABLE import_result (
  step text PRIMARY KEY,
  new_invoices integer,
  new_parts_rows integer,
  skipped_invoices integer,
  skipped_parts_rows integer,
  total_rows integer,
  pv_invoices integer,
  ev_invoices integer
);

CREATE OR REPLACE FUNCTION pg_temp.import_busy_parts_sim(p_source_type text, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_invoices integer := 0;
  v_skipped_invoices integer := 0;
  v_new_parts_rows integer := 0;
  v_skipped_parts_rows integer := 0;
BEGIN
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
        FROM busy_parts_sim bp
        WHERE bp.source_type = p_source_type
          AND upper(btrim(bp.invoice_no)) = upper(i.invoice_no)
          AND bp.invoice_date = i.invoice_date
      ) AS already_uploaded
    FROM incoming i
  ),
  ins AS (
    INSERT INTO busy_parts_sim (
      source_type, job_card_no, invoice_no, invoice_date, gst_rate, net_amount, source_row_key
    )
    SELECT
      p_source_type, c.job_card_no, c.invoice_no, c.invoice_date, c.gst_rate, c.net_amount, c.source_row_key
    FROM classified c
    WHERE NOT c.already_uploaded
    RETURNING 1
  )
  SELECT
    (SELECT count(*)::integer FROM (SELECT DISTINCT upper(invoice_no), invoice_date FROM classified WHERE NOT already_uploaded) s),
    (SELECT count(*)::integer FROM (SELECT DISTINCT upper(invoice_no), invoice_date FROM classified WHERE already_uploaded) s),
    (SELECT count(*)::integer FROM classified WHERE NOT already_uploaded),
    (SELECT count(*)::integer FROM classified WHERE already_uploaded)
  INTO v_new_invoices, v_skipped_invoices, v_new_parts_rows, v_skipped_parts_rows
  FROM (SELECT count(*) FROM ins) AS inserted;

  RETURN jsonb_build_object(
    'new_invoices', v_new_invoices,
    'new_parts_rows', v_new_parts_rows,
    'skipped_invoices', v_skipped_invoices,
    'skipped_parts_rows', v_skipped_parts_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.snapshot_counts()
RETURNS TABLE (total_rows integer, pv_invoices integer, ev_invoices integer)
LANGUAGE sql
AS $$
  SELECT
    count(*)::integer,
    count(DISTINCT (source_type, invoice_no, invoice_date)) FILTER (WHERE source_type = 'PV')::integer,
    count(DISTINCT (source_type, invoice_no, invoice_date)) FILTER (WHERE source_type = 'EV')::integer
  FROM busy_parts_sim;
$$;

CREATE OR REPLACE FUNCTION pg_temp.record_step(p_step text, p_result jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_snap record;
BEGIN
  SELECT * INTO v_snap FROM pg_temp.snapshot_counts();
  INSERT INTO import_result
  VALUES (
    p_step,
    (p_result->>'new_invoices')::integer,
    (p_result->>'new_parts_rows')::integer,
    (p_result->>'skipped_invoices')::integer,
    (p_result->>'skipped_parts_rows')::integer,
    v_snap.total_rows,
    v_snap.pv_invoices,
    v_snap.ev_invoices
  );
END;
$$;

-- Test A: first upload of one invoice with three parts lines
SELECT pg_temp.record_step('A first upload', pg_temp.import_busy_parts_sim('PV', '[
  {"job_card_no":"JC-1","invoice_no":"IMBTAI001","invoice_date":"2026-09-10","gst_rate":18,"net_amount":100,"source_row_key":"PV|JC-1|IMBTAI001|2026-09-10|18|100|PARTA|1"},
  {"job_card_no":"JC-1","invoice_no":"IMBTAI001","invoice_date":"2026-09-10","gst_rate":18,"net_amount":250,"source_row_key":"PV|JC-1|IMBTAI001|2026-09-10|18|250|PARTB|1"},
  {"job_card_no":"JC-1","invoice_no":"IMBTAI001","invoice_date":"2026-09-10","gst_rate":5,"net_amount":500,"source_row_key":"PV|JC-1|IMBTAI001|2026-09-10|5|500|PARTC|1"}
]'::jsonb));

-- Test B: same file again
SELECT pg_temp.record_step('B same file again', pg_temp.import_busy_parts_sim('PV', '[
  {"job_card_no":"JC-1","invoice_no":"IMBTAI001","invoice_date":"2026-09-10","gst_rate":18,"net_amount":100,"source_row_key":"PV|JC-1|IMBTAI001|2026-09-10|18|100|PARTA|1"},
  {"job_card_no":"JC-1","invoice_no":"IMBTAI001","invoice_date":"2026-09-10","gst_rate":18,"net_amount":250,"source_row_key":"PV|JC-1|IMBTAI001|2026-09-10|18|250|PARTB|1"},
  {"job_card_no":"JC-1","invoice_no":"IMBTAI001","invoice_date":"2026-09-10","gst_rate":5,"net_amount":500,"source_row_key":"PV|JC-1|IMBTAI001|2026-09-10|5|500|PARTC|1"}
]'::jsonb));

-- Seed Invoice A (5) and Invoice B (7) for overlapping/historical tests
INSERT INTO busy_parts_sim (source_type, job_card_no, invoice_no, invoice_date, gst_rate, net_amount, source_row_key)
SELECT 'PV', 'JC-A', 'INV-A', '2026-09-01', 18, 10 + g, 'PV|A|' || g
FROM generate_series(1, 5) g;
INSERT INTO busy_parts_sim (source_type, job_card_no, invoice_no, invoice_date, gst_rate, net_amount, source_row_key)
SELECT 'PV', 'JC-B', 'INV-B', '2026-09-01', 18, 20 + g, 'PV|B|' || g
FROM generate_series(1, 7) g;

SELECT pg_temp.record_step('C before overlap', jsonb_build_object(
  'new_invoices', 0, 'new_parts_rows', 0, 'skipped_invoices', 0, 'skipped_parts_rows', 0
));

-- Test C: upload Invoice B + Invoice C
SELECT pg_temp.record_step('C overlapping B+C', pg_temp.import_busy_parts_sim('PV', (
  SELECT jsonb_agg(jsonb_build_object(
    'job_card_no', 'JC-B',
    'invoice_no', 'INV-B',
    'invoice_date', '2026-09-01',
    'gst_rate', 18,
    'net_amount', 20 + g,
    'source_row_key', 'PV|B|' || g
  )) FROM generate_series(1, 7) g
) || (
  SELECT jsonb_agg(jsonb_build_object(
    'job_card_no', 'JC-C',
    'invoice_no', 'INV-C',
    'invoice_date', '2026-10-01',
    'gst_rate', 18,
    'net_amount', 30 + g,
    'source_row_key', 'PV|C|' || g
  )) FROM generate_series(1, 4) g
)));

-- Test D: October added after September
SELECT pg_temp.record_step('D october added', pg_temp.import_busy_parts_sim('PV', '[
  {"job_card_no":"JC-OCT","invoice_no":"INV-OCT-1","invoice_date":"2026-10-15","gst_rate":18,"net_amount":11,"source_row_key":"PV|OCT|1"},
  {"job_card_no":"JC-OCT","invoice_no":"INV-OCT-1","invoice_date":"2026-10-15","gst_rate":18,"net_amount":22,"source_row_key":"PV|OCT|2"}
]'::jsonb));

-- Test E: EV upload must not remove PV
SELECT pg_temp.record_step('E EV upload', pg_temp.import_busy_parts_sim('EV', '[
  {"job_card_no":"JC-E","invoice_no":"EMBTAI001","invoice_date":"2026-09-10","gst_rate":18,"net_amount":9,"source_row_key":"EV|E|1"},
  {"job_card_no":"JC-E","invoice_no":"EMBTAI001","invoice_date":"2026-09-10","gst_rate":5,"net_amount":8,"source_row_key":"EV|E|2"}
]'::jsonb));

SELECT pg_temp.record_step('E EV re-upload', pg_temp.import_busy_parts_sim('EV', '[
  {"job_card_no":"JC-E","invoice_no":"EMBTAI001","invoice_date":"2026-09-10","gst_rate":18,"net_amount":9,"source_row_key":"EV|E|1"},
  {"job_card_no":"JC-E","invoice_no":"EMBTAI001","invoice_date":"2026-09-10","gst_rate":5,"net_amount":8,"source_row_key":"EV|E|2"}
]'::jsonb));

DO $$
DECLARE
  v_a import_result%ROWTYPE;
  v_b import_result%ROWTYPE;
  v_c import_result%ROWTYPE;
  v_d import_result%ROWTYPE;
  v_e import_result%ROWTYPE;
  v_e2 import_result%ROWTYPE;
  v_inv_a integer;
  v_inv_b integer;
  v_inv_c integer;
BEGIN
  SELECT * INTO v_a FROM import_result WHERE step = 'A first upload';
  IF v_a.new_invoices <> 1 OR v_a.new_parts_rows <> 3 OR v_a.total_rows <> 3 THEN
    RAISE EXCEPTION 'Test A failed: %', v_a;
  END IF;

  SELECT * INTO v_b FROM import_result WHERE step = 'B same file again';
  IF v_b.new_invoices <> 0 OR v_b.new_parts_rows <> 0 OR v_b.skipped_invoices <> 1 OR v_b.skipped_parts_rows <> 3 OR v_b.total_rows <> 3 THEN
    RAISE EXCEPTION 'Test B failed: %', v_b;
  END IF;

  SELECT * INTO v_c FROM import_result WHERE step = 'C overlapping B+C';
  SELECT count(*) INTO v_inv_a FROM busy_parts_sim WHERE invoice_no = 'INV-A';
  SELECT count(*) INTO v_inv_b FROM busy_parts_sim WHERE invoice_no = 'INV-B';
  SELECT count(*) INTO v_inv_c FROM busy_parts_sim WHERE invoice_no = 'INV-C';
  IF v_c.skipped_invoices <> 1 OR v_c.skipped_parts_rows <> 7 OR v_c.new_invoices <> 1 OR v_c.new_parts_rows <> 4 THEN
    RAISE EXCEPTION 'Test C skip/insert counts failed: %', v_c;
  END IF;
  IF v_inv_a <> 5 OR v_inv_b <> 7 OR v_inv_c <> 4 THEN
    RAISE EXCEPTION 'Test C retention failed A=% B=% C=%', v_inv_a, v_inv_b, v_inv_c;
  END IF;

  SELECT * INTO v_d FROM import_result WHERE step = 'D october added';
  IF v_d.new_invoices <> 1 OR v_d.new_parts_rows <> 2 THEN
    RAISE EXCEPTION 'Test D failed: %', v_d;
  END IF;
  IF (SELECT count(*) FROM busy_parts_sim WHERE invoice_date >= DATE '2026-09-01' AND invoice_date < DATE '2026-10-01') < 3 THEN
    RAISE EXCEPTION 'Test D deleted September rows';
  END IF;

  SELECT * INTO v_e FROM import_result WHERE step = 'E EV upload';
  SELECT * INTO v_e2 FROM import_result WHERE step = 'E EV re-upload';
  IF v_e.new_invoices <> 1 OR v_e.new_parts_rows <> 2 OR v_e.pv_invoices < 1 THEN
    RAISE EXCEPTION 'Test E PV isolation failed: %', v_e;
  END IF;
  IF v_e2.new_invoices <> 0 OR v_e2.total_rows <> v_e.total_rows OR v_e2.pv_invoices <> v_e.pv_invoices THEN
    RAISE EXCEPTION 'Test E re-upload changed PV/EV counts: before=% after=%', v_e, v_e2;
  END IF;
END;
$$;

SELECT step, new_invoices, new_parts_rows, skipped_invoices, skipped_parts_rows, total_rows, pv_invoices, ev_invoices
FROM import_result
ORDER BY step;

ROLLBACK;
