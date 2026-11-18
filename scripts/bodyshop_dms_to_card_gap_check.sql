-- READ-ONLY. T18 pilot: DMS Accident invoices in a month vs live bodyshop cards.
-- Use July+ after bodyshop go-live (June is expected noisy). Change month bounds in all three queries.
-- Plan: docs/BODYSHOP_INTEGRITY_FIX_PLAN.md (T18). App KPI: list_bodyshop_dms_missing_on_tracker RPC.
-- Subclasses (missing on live card):
--   T18a = live card has same JC as DMS but not this invoice (often wrong invoice or blank)
--   T18b = live card for same reg but different JC
--   T18c = no live card for that reg

-- QUERY 0: counts for the month
WITH month_dms AS (
  SELECT upper(btrim(invoice_number)) AS inv
  FROM public.psf_revenue_dms
  WHERE invoice_date >= '2026-07-01' AND invoice_date < '2026-08-01'
    AND sr_type = 'Accident'
    AND nullif(btrim(invoice_number), '') IS NOT NULL
    AND upper(btrim(invoice_number)) ~ '^[IE]MBTAI[0-9]{10}$'
),
on_live AS (
  SELECT upper(btrim(s.invoice_number)) AS inv
  FROM public.bodyshop_settlements s
  JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
  WHERE c.overall_status <> 'cancelled'
    AND nullif(btrim(s.invoice_number), '') IS NOT NULL
)
SELECT
  (SELECT count(*) FROM month_dms) AS dms_accident_invoices,
  (SELECT count(*) FROM month_dms d WHERE EXISTS (SELECT 1 FROM on_live o WHERE o.inv = d.inv)) AS on_live_card,
  (SELECT count(*) FROM month_dms d WHERE NOT EXISTS (SELECT 1 FROM on_live o WHERE o.inv = d.inv)) AS missing_on_live_card;

-- QUERY 1: subclass breakdown of "missing"
WITH month_dms AS (
  SELECT DISTINCT ON (upper(btrim(invoice_number)))
         upper(btrim(invoice_number)) AS inv,
         upper(btrim(job_card_number)) AS jc,
         regexp_replace(upper(coalesce(vehicle_registration_number,'')),'[^A-Z0-9]','','g') AS reg,
         vehicle_registration_number AS raw_reg,
         invoice_date,
         total_invoice_amount AS amt,
         trim(coalesce(first_name,'')||' '||coalesce(last_name,'')) AS cust
  FROM public.psf_revenue_dms
  WHERE invoice_date >= '2026-07-01' AND invoice_date < '2026-08-01'
    AND sr_type = 'Accident'
    AND nullif(btrim(invoice_number), '') IS NOT NULL
    AND upper(btrim(invoice_number)) ~ '^[IE]MBTAI[0-9]{10}$'
  ORDER BY upper(btrim(invoice_number)), invoice_date DESC
),
missing AS (
  SELECT d.* FROM month_dms d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bodyshop_settlements s
    JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id AND c.overall_status <> 'cancelled'
    WHERE upper(btrim(s.invoice_number)) = d.inv)
)
SELECT
  count(*) AS missing_total,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.bodyshop_repair_cards c
    WHERE c.overall_status <> 'cancelled' AND upper(btrim(c.job_card_no)) = missing.jc)) AS t18a_same_jc,
  count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.bodyshop_repair_cards c
    WHERE c.overall_status <> 'cancelled' AND upper(btrim(c.job_card_no)) = missing.jc)
    AND EXISTS (SELECT 1 FROM public.bodyshop_repair_cards c
    WHERE c.overall_status <> 'cancelled' AND regexp_replace(upper(c.reg_number),'[^A-Z0-9]','','g') = missing.reg)) AS t18b_same_reg,
  count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.bodyshop_repair_cards c
    WHERE c.overall_status <> 'cancelled' AND regexp_replace(upper(c.reg_number),'[^A-Z0-9]','','g') = missing.reg)) AS t18c_no_live_reg
FROM missing;

-- QUERY 2: detail (all missing rows, with subclass)
WITH month_dms AS (
  SELECT DISTINCT ON (upper(btrim(invoice_number)))
         upper(btrim(invoice_number)) AS inv,
         upper(btrim(job_card_number)) AS jc,
         regexp_replace(upper(coalesce(vehicle_registration_number,'')),'[^A-Z0-9]','','g') AS reg,
         vehicle_registration_number AS raw_reg,
         invoice_date,
         total_invoice_amount AS amt,
         trim(coalesce(first_name,'')||' '||coalesce(last_name,'')) AS cust
  FROM public.psf_revenue_dms
  WHERE invoice_date >= '2026-07-01' AND invoice_date < '2026-08-01'
    AND sr_type = 'Accident'
    AND nullif(btrim(invoice_number), '') IS NOT NULL
    AND upper(btrim(invoice_number)) ~ '^[IE]MBTAI[0-9]{10}$'
  ORDER BY upper(btrim(invoice_number)), invoice_date DESC
)
SELECT
  d.inv, d.invoice_date, d.raw_reg, d.jc, d.amt, d.cust,
  (SELECT array_agg(c.id ORDER BY c.id) FROM public.bodyshop_repair_cards c
   WHERE c.overall_status <> 'cancelled' AND upper(btrim(c.job_card_no)) = d.jc) AS live_cards_same_jc,
  (SELECT array_agg(c.id ORDER BY c.id) FROM public.bodyshop_repair_cards c
   WHERE c.overall_status <> 'cancelled'
     AND regexp_replace(upper(c.reg_number),'[^A-Z0-9]','','g') = d.reg) AS live_cards_same_reg,
  (SELECT upper(btrim(s.invoice_number)) FROM public.bodyshop_settlements s
   JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
   WHERE c.overall_status <> 'cancelled' AND upper(btrim(c.job_card_no)) = d.jc
   LIMIT 1) AS invoice_on_jc_card,
  CASE
    WHEN EXISTS (SELECT 1 FROM public.bodyshop_repair_cards c
                 WHERE c.overall_status <> 'cancelled' AND upper(btrim(c.job_card_no)) = d.jc)
      THEN 'T18a'
    WHEN EXISTS (SELECT 1 FROM public.bodyshop_repair_cards c
                 WHERE c.overall_status <> 'cancelled'
                   AND regexp_replace(upper(c.reg_number),'[^A-Z0-9]','','g') = d.reg)
      THEN 'T18b'
    ELSE 'T18c'
  END AS subclass
FROM month_dms d
WHERE NOT EXISTS (
  SELECT 1 FROM public.bodyshop_settlements s
  JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
  WHERE c.overall_status <> 'cancelled' AND upper(btrim(s.invoice_number)) = d.inv)
ORDER BY subclass, d.invoice_date, d.inv;