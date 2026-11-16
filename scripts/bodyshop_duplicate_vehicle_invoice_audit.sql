-- READ-ONLY audit: duplicate / look-alike Bodyshop job cards for one registration, and where an invoice number lives.
-- Edit the two values below, then run each SELECT separately in the Supabase SQL Editor. Changes nothing.
-- Case: RJ45CK9236 with JC ...004107 and JC ...004170; invoice IMBTAI2627004371.

-- 1) Cards for the registration (look at job_card_no, created_at, status, stage, reception link)
SELECT c.id, c.job_card_no, c.reg_number, c.customer_name, c.sa_name, c.overall_status,
       c.current_stage, c.created_at, c.reception_entry_id, c.billed_amount, c.do_amount, c.payment_status
FROM public.bodyshop_repair_cards c
WHERE upper(btrim(c.reg_number)) = 'RJ45CK9236'
ORDER BY c.created_at;

-- 2) Exact duplicate job card numbers anywhere (expect 0 rows if the numbers truly differ)
SELECT upper(btrim(job_card_no)) AS jc, count(*) AS cards, array_agg(id ORDER BY id) AS card_ids
FROM public.bodyshop_repair_cards
GROUP BY 1 HAVING count(*) > 1;

-- 3) Settlement header + line counts for those cards (lines are append-only, so many lines = card cannot be hard-deleted)
SELECT c.id AS card_id, c.job_card_no, s.invoice_number, s.invoice_date, s.invoice_amount, s.invoice_source,
       s.invoice_account, s.invoice_amount_variance_reason, s.do_amount, s.insurance_due_amount,
       (SELECT count(*) FROM public.bodyshop_settlement_lines l WHERE l.repair_card_id = c.id) AS lines_total,
       (SELECT count(*) FROM public.bodyshop_settlement_lines l WHERE l.repair_card_id = c.id AND NOT l.is_reversed) AS lines_live
FROM public.bodyshop_repair_cards c
LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id
WHERE upper(btrim(c.reg_number)) = 'RJ45CK9236'
ORDER BY c.created_at;

-- 4) Which job card does DMS say invoice ...4371 belongs to? (the key question)
SELECT d.invoice_number, d.invoice_date, d.job_card_number, d.total_invoice_amount, d.invoice_status, d.account
FROM public.psf_revenue_dms d
WHERE d.invoice_number ILIKE '%4371'
   OR upper(btrim(d.job_card_number)) IN (
        SELECT upper(btrim(job_card_no)) FROM public.bodyshop_repair_cards WHERE upper(btrim(reg_number)) = 'RJ45CK9236')
ORDER BY d.invoice_date;

-- 5) Any other card or settlement carrying invoice ...4371 (should be exactly the one you want to fix)
SELECT s.repair_card_id, s.job_card_no, s.invoice_number, s.invoice_date, s.invoice_amount
FROM public.bodyshop_settlements s
WHERE s.invoice_number ILIKE '%4371';

-- 6) Who created each card / when stage moved (history)
SELECT h.* FROM public.bodyshop_repair_card_stage_history h
WHERE h.repair_card_id IN (SELECT id FROM public.bodyshop_repair_cards WHERE upper(btrim(reg_number)) = 'RJ45CK9236')
ORDER BY h.repair_card_id, h.created_at;
