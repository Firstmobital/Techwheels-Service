-- Audit: insurance-tracked cards with DMS invoice but DO amount missing or zero.
-- Run: node scripts/apply-sql-files.mjs supabase/sql_checks/bodyshop_do_zero_insurance_audit.sql

-- A) Strict: claim + policy on card + settlement invoice + DO coalesce 0
WITH live AS (
  SELECT c.id,
         c.job_card_no,
         c.reg_number,
         c.customer_name,
         c.insurance_company,
         c.claim_intimation_no,
         c.do_amount AS card_do,
         c.branch,
         c.current_stage
    FROM public.bodyshop_repair_cards c
   WHERE c.overall_status <> 'cancelled'
),
settle AS (
  SELECT s.repair_card_id,
         s.invoice_number,
         s.invoice_date,
         s.invoice_amount,
         s.do_amount AS settle_do,
         s.do_status
    FROM public.bodyshop_settlements s
),
dms AS (
  SELECT DISTINCT ON (upper(btrim(d.job_card_number)))
         upper(btrim(d.job_card_number)) AS jc,
         d.invoice_number,
         d.invoice_date AS dms_inv_date,
         d.total_invoice_amount AS dms_amt,
         d.account AS dms_account
    FROM public.psf_revenue_dms d
   WHERE coalesce(d.invoice_status, '') <> 'Cancelled'
     AND nullif(btrim(d.job_card_number), '') IS NOT NULL
   ORDER BY upper(btrim(d.job_card_number)), d.invoice_date DESC NULLS LAST, d.updated_at DESC NULLS LAST
)
SELECT count(*) AS strict_count
FROM live l
JOIN settle s ON s.repair_card_id = l.id
JOIN dms d ON d.jc = upper(btrim(l.job_card_no))
WHERE nullif(btrim(l.claim_intimation_no), '') IS NOT NULL
  AND nullif(btrim(l.insurance_company), '') IS NOT NULL
  AND nullif(btrim(s.invoice_number), '') IS NOT NULL
  AND coalesce(s.settle_do, l.card_do, 0) = 0;

-- B) Sample rows (strict), latest 30
WITH live AS (
  SELECT c.id,
         c.job_card_no,
         c.reg_number,
         c.insurance_company,
         c.claim_intimation_no,
         c.do_amount AS card_do,
         c.branch
    FROM public.bodyshop_repair_cards c
   WHERE c.overall_status <> 'cancelled'
),
settle AS (
  SELECT s.repair_card_id, s.invoice_number, s.invoice_amount, s.do_amount AS settle_do, s.do_status
    FROM public.bodyshop_settlements s
),
dms AS (
  SELECT DISTINCT ON (upper(btrim(d.job_card_number)))
         upper(btrim(d.job_card_number)) AS jc,
         d.invoice_number AS dms_inv,
         d.total_invoice_amount AS dms_amt,
         d.account AS dms_account
    FROM public.psf_revenue_dms d
   WHERE coalesce(d.invoice_status, '') <> 'Cancelled'
   ORDER BY upper(btrim(d.job_card_number)), d.invoice_date DESC NULLS LAST, d.updated_at DESC NULLS LAST
)
SELECT l.id AS card_id,
       l.job_card_no,
       l.reg_number,
       l.insurance_company,
       l.claim_intimation_no,
       s.invoice_number,
       s.invoice_amount,
       coalesce(s.settle_do, l.card_do) AS do_amount,
       s.do_status,
       d.dms_amt,
       d.dms_account
FROM live l
JOIN settle s ON s.repair_card_id = l.id
JOIN dms d ON d.jc = upper(btrim(l.job_card_no))
WHERE nullif(btrim(l.claim_intimation_no), '') IS NOT NULL
  AND nullif(btrim(l.insurance_company), '') IS NOT NULL
  AND nullif(btrim(s.invoice_number), '') IS NOT NULL
  AND coalesce(s.settle_do, l.card_do, 0) = 0
ORDER BY s.invoice_amount DESC NULLS LAST, l.id
LIMIT 30;

-- C) Broader: DMS account looks like insurer (not business/self/cash) + claim, DO zero, any invoice on card OR DMS
WITH live AS (
  SELECT c.id, c.job_card_no, c.reg_number, c.insurance_company, c.claim_intimation_no,
         c.do_amount AS card_do
    FROM public.bodyshop_repair_cards c
   WHERE c.overall_status <> 'cancelled'
),
settle AS (
  SELECT s.repair_card_id, s.invoice_number, s.invoice_amount, s.do_amount AS settle_do
    FROM public.bodyshop_settlements s
),
dms AS (
  SELECT DISTINCT ON (upper(btrim(d.job_card_number)))
         upper(btrim(d.job_card_number)) AS jc,
         d.invoice_number,
         d.total_invoice_amount,
         d.account
    FROM public.psf_revenue_dms d
   WHERE coalesce(d.invoice_status, '') <> 'Cancelled'
   ORDER BY upper(btrim(d.job_card_number)), d.invoice_date DESC NULLS LAST, d.updated_at DESC NULLS LAST
)
SELECT count(*) AS dms_insurer_account_count
FROM live l
JOIN dms d ON d.jc = upper(btrim(l.job_card_no))
LEFT JOIN settle s ON s.repair_card_id = l.id
WHERE nullif(btrim(l.claim_intimation_no), '') IS NOT NULL
  AND coalesce(s.settle_do, l.card_do, 0) = 0
  AND (
    nullif(btrim(s.invoice_number), '') IS NOT NULL
    OR nullif(btrim(d.invoice_number), '') IS NOT NULL
  )
  AND nullif(btrim(d.account), '') IS NOT NULL
  AND upper(d.account) NOT LIKE '%BUSINESS%'
  AND upper(d.account) NOT LIKE '%SELF%'
  AND upper(d.account) NOT LIKE '%EMPLOY%'
  AND upper(d.account) NOT LIKE '%CASH%'
  AND upper(d.account) NOT LIKE '%CUSTOMER%';