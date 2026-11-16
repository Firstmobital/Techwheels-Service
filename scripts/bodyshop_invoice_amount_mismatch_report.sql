-- BODYSHOP-BILLING-GUARD-001 report (read-only, SELECT only). Changes nothing.
-- Run each query on its own (the SQL editor shows only the last result).
-- DMS amount = latest non-cancelled psf_revenue_dms.total_invoice_amount per job card.
-- Tolerance 0.50 rupees (same as the guard): smaller differences are whole-rupee rounding.

-- ===== QUERY 1: billed cards whose amount differs from DMS by more than 0.50 (needs a fix or a reason) =====
WITH dms AS (
  SELECT DISTINCT ON (upper(btrim(job_card_number)))
    upper(btrim(job_card_number)) AS jc, invoice_number, total_invoice_amount
  FROM public.psf_revenue_dms
  WHERE COALESCE(invoice_status, '') <> 'Cancelled'
  ORDER BY upper(btrim(job_card_number)), invoice_date DESC NULLS LAST, updated_at DESC NULLS LAST
)
SELECT b.id, b.job_card_no, b.overall_status, b.billed_amount, d.invoice_number, d.total_invoice_amount AS dms_amount,
       b.billed_amount - d.total_invoice_amount AS diff,
       s.invoice_amount_variance_reason AS reason_on_file
FROM public.bodyshop_repair_cards b
JOIN dms d ON d.jc = upper(btrim(b.job_card_no))
LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id = b.id
WHERE b.billed_amount IS NOT NULL
  AND d.total_invoice_amount IS NOT NULL
  AND abs(b.billed_amount - d.total_invoice_amount) > 0.5
ORDER BY abs(b.billed_amount - d.total_invoice_amount) DESC;

-- ===== QUERY 2: billed cards with NO usable DMS amount (cannot be checked) =====
WITH dms AS (
  SELECT DISTINCT ON (upper(btrim(job_card_number)))
    upper(btrim(job_card_number)) AS jc, total_invoice_amount
  FROM public.psf_revenue_dms
  WHERE COALESCE(invoice_status, '') <> 'Cancelled'
  ORDER BY upper(btrim(job_card_number)), invoice_date DESC NULLS LAST, updated_at DESC NULLS LAST
)
SELECT b.id, b.job_card_no, b.overall_status, b.billed_amount, b.created_at::date AS created,
       CASE WHEN d.jc IS NULL THEN 'no DMS row' ELSE 'DMS amount empty' END AS why
FROM public.bodyshop_repair_cards b
LEFT JOIN dms d ON d.jc = upper(btrim(b.job_card_no))
WHERE b.billed_amount IS NOT NULL
  AND b.overall_status = 'active'
  AND (d.jc IS NULL OR d.total_invoice_amount IS NULL)
ORDER BY b.created_at DESC;
