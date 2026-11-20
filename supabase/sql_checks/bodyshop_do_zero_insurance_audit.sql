-- Audit: insurance_do_zero candidates from DMS import only (busy_insurance_master bill-to).
-- Run: node scripts/apply-sql-files.mjs supabase/sql_checks/bodyshop_do_zero_insurance_audit.sql

-- Count live cards: DMS insurer bill-to, DMS amount > 0, tracker DO still 0
WITH dms AS (
  SELECT DISTINCT ON (upper(btrim(d.job_card_number)))
         upper(btrim(d.job_card_number)) AS jc,
         d.invoice_number,
         d.invoice_date,
         d.total_invoice_amount AS dms_amt,
         nullif(btrim(d.account), '') AS dms_account
    FROM public.psf_revenue_dms d
   WHERE coalesce(d.invoice_status, '') NOT ILIKE '%cancel%'
     AND d.sr_type = 'Accident'
     AND nullif(btrim(d.job_card_number), '') IS NOT NULL
   ORDER BY upper(btrim(d.job_card_number)), d.invoice_date DESC NULLS LAST, d.updated_at DESC NULLS LAST
),
insurer AS (
  SELECT d.*
    FROM dms d
   WHERE public._bodyshop_dms_bill_to_is_insurer(d.dms_account)
     AND coalesce(d.dms_amt, 0) > 0
),
cards AS (
  SELECT c.id,
         upper(btrim(c.job_card_no)) AS jc,
         c.do_amount AS card_do,
         s.do_amount AS settle_do,
         s.invoice_number,
         c.claim_intimation_no,
         c.insurance_company
    FROM public.bodyshop_repair_cards c
    LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id
   WHERE c.overall_status <> 'cancelled'
)
SELECT
  count(*) AS mapped_insurer_do_zero,
  count(*) FILTER (
    WHERE i.invoice_date >= '2026-11-01'::date AND i.invoice_date <= '2026-11-30'::date
  ) AS mapped_in_nov_2026
FROM insurer i
JOIN cards ca ON ca.jc = i.jc
WHERE coalesce(ca.settle_do, ca.card_do, 0) = 0;

WITH dms AS (
  SELECT DISTINCT ON (upper(btrim(d.job_card_number)))
         upper(btrim(d.job_card_number)) AS jc,
         d.invoice_date,
         d.total_invoice_amount AS dms_amt,
         nullif(btrim(d.account), '') AS dms_account
    FROM public.psf_revenue_dms d
   WHERE coalesce(d.invoice_status, '') NOT ILIKE '%cancel%'
     AND d.sr_type = 'Accident'
     AND nullif(btrim(d.job_card_number), '') IS NOT NULL
   ORDER BY upper(btrim(d.job_card_number)), d.invoice_date DESC NULLS LAST, d.updated_at DESC NULLS LAST
),
cards AS (
  SELECT c.id,
         upper(btrim(c.job_card_no)) AS jc,
         c.do_amount AS card_do,
         s.do_amount AS settle_do
    FROM public.bodyshop_repair_cards c
    LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id
   WHERE c.overall_status <> 'cancelled'
)
SELECT count(*) AS unmapped_insurer_do_zero
FROM dms d
JOIN cards ca ON ca.jc = d.jc
WHERE coalesce(d.dms_amt, 0) > 0
  AND coalesce(ca.settle_do, ca.card_do, 0) = 0
  AND public._bodyshop_dms_bill_to_is_unmapped_insurer(d.dms_account);