-- BATCH 1 / T1: same invoice number on 2+ live Bodyshop cards. READ-ONLY. Run each query separately.
-- Purpose: let you verify the ground truth for every case yourself before any fix is written.
-- Plan + tracker: docs/BODYSHOP_INTEGRITY_FIX_PLAN.md

-- QUERY 1: one row per card involved, with DMS evidence and the card's own history.
-- jc_match / reg_match compare the card with what DMS says for THIS invoice.
-- suggested = rule-based suggestion only, never applied. Check it against your own knowledge of the vehicle.
WITH grp AS (
  SELECT upper(btrim(s.invoice_number)) invn FROM public.bodyshop_settlements s
  JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
  WHERE c.overall_status <> 'cancelled' AND nullif(btrim(s.invoice_number),'') IS NOT NULL
  GROUP BY 1 HAVING count(*) > 1),
d AS (SELECT DISTINCT ON (upper(btrim(invoice_number))) upper(btrim(invoice_number)) invn, job_card_number, vehicle_registration_number,
             trim(coalesce(first_name,'')||' '||coalesce(last_name,'')) cust, total_invoice_amount, invoice_date
      FROM public.psf_revenue_dms ORDER BY upper(btrim(invoice_number)), invoice_date DESC),
x AS (
  SELECT g.invn, c.id, c.job_card_no, c.reg_number, c.customer_name, c.sa_name, c.current_stage, c.created_at::date AS card_created,
         c.reception_entry_id, s.invoice_date, s.invoice_amount, s.invoice_source,
         d.job_card_number dms_jc, d.vehicle_registration_number dms_reg, d.cust dms_customer, d.total_invoice_amount dms_amount, d.invoice_date dms_date,
         (upper(btrim(c.job_card_no)) = upper(btrim(d.job_card_number))) AS jc_match,
         (regexp_replace(upper(c.reg_number),'[^A-Z0-9]','','g') = regexp_replace(upper(coalesce(d.vehicle_registration_number,'')),'[^A-Z0-9]','','g')) AS reg_match,
         (SELECT count(*) FROM public.bodyshop_settlement_lines l WHERE l.repair_card_id=c.id AND NOT l.is_reversed AND l.line_type<>'reversal') AS live_lines,
         (SELECT coalesce(sum(amount),0) FROM public.bodyshop_settlement_lines l WHERE l.repair_card_id=c.id AND NOT l.is_reversed AND l.line_type='do_component') AS live_do,
         (SELECT coalesce(sum(amount),0) FROM public.bodyshop_settlement_lines l WHERE l.repair_card_id=c.id AND NOT l.is_reversed AND l.line_type='receipt') AS live_receipts,
         (SELECT count(*) FROM public.bodyshop_repair_card_stage_history h WHERE h.repair_card_id=c.id) AS stage_history_rows,
         (SELECT count(*) FROM public.bodyshop_intake_vehicle_photos p WHERE p.repair_card_id=c.id) AS intake_photos
  FROM grp g
  JOIN public.bodyshop_settlements s ON upper(btrim(s.invoice_number)) = g.invn
  JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id AND c.overall_status <> 'cancelled'
  LEFT JOIN d ON d.invn = g.invn)
SELECT x.*,
  CASE WHEN jc_match AND reg_match THEN 'KEEP - card matches DMS'
       WHEN NOT reg_match AND live_lines = 0 THEN 'CANCEL - other vehicle, no money'
       WHEN NOT reg_match THEN 'STRIP INVOICE + reverse money, keep card (other vehicle owns this invoice)'
       WHEN live_lines = 0 THEN 'CANCEL - extra card for same visit, no money'
       ELSE 'NEEDS DECISION - same vehicle, money on this card' END AS suggested
FROM x ORDER BY invn, id;

-- QUERY 2: every live money line on the cards of those invoices (the money you are validating).
WITH grp AS (
  SELECT upper(btrim(s.invoice_number)) invn FROM public.bodyshop_settlements s
  JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
  WHERE c.overall_status <> 'cancelled' AND nullif(btrim(s.invoice_number),'') IS NOT NULL
  GROUP BY 1 HAVING count(*) > 1)
SELECT g.invn, l.repair_card_id, l.id AS line_id, l.line_type, l.party, l.component, l.amount, l.txn_date, l.reference, l.voucher_no,
       l.created_at::date AS posted_on, l.actor_email
FROM grp g
JOIN public.bodyshop_settlements s ON upper(btrim(s.invoice_number)) = g.invn
JOIN public.bodyshop_settlement_lines l ON l.repair_card_id = s.repair_card_id AND NOT l.is_reversed AND l.line_type <> 'reversal'
ORDER BY g.invn, l.repair_card_id, l.id;

-- QUERY 3: how each of these cards was created and moved (who/when), for the cards that look like extras.
SELECT h.* FROM public.bodyshop_repair_card_stage_history h
WHERE h.repair_card_id IN (1024,1220,1052,1103,441,458,1031,1293,1302,1310)
ORDER BY h.repair_card_id, h.created_at;
