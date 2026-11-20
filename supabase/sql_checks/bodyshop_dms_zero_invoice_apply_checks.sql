-- BODYSHOP-SETTLEMENT: DMS rows with invoice number but zero/null total (Use DMS invoice blocked in UI).
-- Run: node scripts/apply-sql-files.mjs supabase/sql_checks/bodyshop_dms_zero_invoice_apply_checks.sql

-- 1) Sample job card from invoice-blank gap report
SELECT
  upper(btrim(d.job_card_number)) AS jc,
  d.invoice_number,
  d.invoice_date,
  d.total_invoice_amount,
  d.final_labour_amount,
  d.final_spares_amount,
  d.invoice_status,
  d.account,
  (d.total_invoice_amount IS NULL) AS amt_is_null,
  (coalesce(d.total_invoice_amount, 0) = 0) AS amt_is_zero_or_null
FROM public.psf_revenue_dms d
WHERE upper(btrim(d.job_card_number)) = upper(btrim('JC-MBTPLT-JP1-2627-008274'))
  AND coalesce(d.invoice_status, '') <> 'Cancelled'
ORDER BY d.invoice_date DESC NULLS LAST, d.updated_at DESC NULLS LAST;

-- 2) All accident DMS rows on cards with blank settlement invoice (matches tracker invoice_missing logic, simplified)
WITH cards_blank AS (
  SELECT c.id, upper(btrim(c.job_card_no)) AS jc
  FROM public.bodyshop_repair_cards c
  LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id
  WHERE c.overall_status <> 'cancelled'
    AND nullif(btrim(s.invoice_number), '') IS NULL
    AND nullif(btrim(c.job_card_no), '') IS NOT NULL
),
dms_latest AS (
  SELECT DISTINCT ON (upper(btrim(d.job_card_number)))
         upper(btrim(d.job_card_number)) AS jc,
         d.invoice_number,
         d.total_invoice_amount AS amt
    FROM public.psf_revenue_dms d
   WHERE coalesce(d.invoice_status, '') <> 'Cancelled'
     AND nullif(btrim(d.job_card_number), '') IS NOT NULL
   ORDER BY upper(btrim(d.job_card_number)), d.invoice_date DESC NULLS LAST, d.updated_at DESC NULLS LAST
)
SELECT
  count(*) FILTER (WHERE dl.jc IS NOT NULL) AS blank_cards_with_dms_row,
  count(*) FILTER (WHERE dl.jc IS NOT NULL AND coalesce(dl.amt, 0) = 0) AS with_zero_or_null_amt,
  count(*) FILTER (WHERE dl.jc IS NOT NULL AND coalesce(dl.amt, 0) > 0) AS with_positive_amt
FROM cards_blank cb
LEFT JOIN dms_latest dl ON dl.jc = cb.jc;

-- 3) List zero/null amount rows among invoice-blank cards (up to 25)
WITH cards_blank AS (
  SELECT c.id, upper(btrim(c.job_card_no)) AS jc
  FROM public.bodyshop_repair_cards c
  LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id
  WHERE c.overall_status <> 'cancelled'
    AND nullif(btrim(s.invoice_number), '') IS NULL
    AND nullif(btrim(c.job_card_no), '') IS NOT NULL
),
dms_latest AS (
  SELECT DISTINCT ON (upper(btrim(d.job_card_number)))
         upper(btrim(d.job_card_number)) AS jc,
         d.invoice_number,
         d.invoice_date,
         d.total_invoice_amount AS amt
    FROM public.psf_revenue_dms d
   WHERE coalesce(d.invoice_status, '') <> 'Cancelled'
   ORDER BY upper(btrim(d.job_card_number)), d.invoice_date DESC NULLS LAST, d.updated_at DESC NULLS LAST
)
SELECT cb.id AS card_id, cb.jc, dl.invoice_number, dl.invoice_date, dl.amt
FROM cards_blank cb
JOIN dms_latest dl ON dl.jc = cb.jc
WHERE coalesce(dl.amt, 0) = 0
ORDER BY dl.invoice_date DESC NULLS LAST
LIMIT 25;