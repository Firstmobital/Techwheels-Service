-- BATCH B2: card's JOB CARD or INVOICE belongs to ANOTHER vehicle in DMS. READ-ONLY. Run each query separately.
-- Looks only at LIVE cards (not cancelled). Registrations are compared after removing spaces/symbols, ignoring DMS blanks and "AF".
-- class: 'REG TYPO'        = card reg and DMS reg differ by 1 character, or 2 characters swapped (card probably has the wrong registration)
--        'DIFFERENT VEHICLE' = completely different registration (card probably carries another vehicle's job card/invoice)
-- Plan + tracker: docs/BODYSHOP_INTEGRITY_FIX_PLAN.md

-- QUERY 1: how many cases (count by class and by where the mismatch is found)
WITH live AS (SELECT * FROM public.bodyshop_repair_cards WHERE overall_status <> 'cancelled'),
dj AS (SELECT DISTINCT ON (upper(btrim(job_card_number))) upper(btrim(job_card_number)) jc, regexp_replace(upper(coalesce(vehicle_registration_number,'')),'[^A-Z0-9]','','g') reg
       FROM public.psf_revenue_dms WHERE nullif(btrim(job_card_number),'') IS NOT NULL ORDER BY upper(btrim(job_card_number)), invoice_date DESC),
di AS (SELECT DISTINCT ON (upper(btrim(invoice_number))) upper(btrim(invoice_number)) inv, regexp_replace(upper(coalesce(vehicle_registration_number,'')),'[^A-Z0-9]','','g') reg
       FROM public.psf_revenue_dms WHERE nullif(btrim(invoice_number),'') IS NOT NULL ORDER BY upper(btrim(invoice_number)), invoice_date DESC),
x AS (SELECT c.id, regexp_replace(upper(c.reg_number),'[^A-Z0-9]','','g') creg, dj.reg jreg, di.reg ireg
      FROM live c LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id
      LEFT JOIN dj ON dj.jc = upper(btrim(c.job_card_no)) LEFT JOIN di ON di.inv = upper(btrim(s.invoice_number))),
f AS (SELECT x.*, (jreg IS NOT NULL AND jreg NOT IN ('','AF') AND jreg <> creg) AS jc_bad, (ireg IS NOT NULL AND ireg NOT IN ('','AF') AND ireg <> creg) AS inv_bad FROM x),
g AS (SELECT f.*, CASE WHEN jc_bad THEN jreg ELSE ireg END AS treg FROM f WHERE jc_bad OR inv_bad),
h AS (SELECT g.*, (length(creg)=length(treg) AND (
        (SELECT count(*) FROM generate_series(1,length(creg)) i WHERE substr(creg,i,1)<>substr(treg,i,1)) = 1
        OR ((SELECT count(*) FROM generate_series(1,length(creg)) i WHERE substr(creg,i,1)<>substr(treg,i,1)) = 2
            AND (SELECT string_agg(ch,'' ORDER BY ch) FROM regexp_split_to_table(creg,'') ch) = (SELECT string_agg(ch,'' ORDER BY ch) FROM regexp_split_to_table(treg,'') ch)))) AS typo FROM g)
SELECT CASE WHEN typo THEN 'REG TYPO' ELSE 'DIFFERENT VEHICLE' END AS class,
       CASE WHEN jc_bad AND inv_bad THEN 'job card and invoice' WHEN jc_bad THEN 'job card only' ELSE 'invoice only' END AS found_in,
       count(*) AS cards, array_agg(id ORDER BY id) AS card_ids
FROM h GROUP BY 1,2 ORDER BY 1,2;

-- QUERY 2: one row per case, with the evidence to validate it. 'suggested' is a rule-based hint only, never applied.
WITH live AS (SELECT * FROM public.bodyshop_repair_cards WHERE overall_status <> 'cancelled'),
dj AS (SELECT DISTINCT ON (upper(btrim(job_card_number))) upper(btrim(job_card_number)) jc, vehicle_registration_number rawreg,
              regexp_replace(upper(coalesce(vehicle_registration_number,'')),'[^A-Z0-9]','','g') reg, invoice_number inv, total_invoice_amount amt,
              trim(coalesce(first_name,'')||' '||coalesce(last_name,'')) cust, sr_type
       FROM public.psf_revenue_dms WHERE nullif(btrim(job_card_number),'') IS NOT NULL ORDER BY upper(btrim(job_card_number)), invoice_date DESC),
di AS (SELECT DISTINCT ON (upper(btrim(invoice_number))) upper(btrim(invoice_number)) inv, vehicle_registration_number rawreg,
              regexp_replace(upper(coalesce(vehicle_registration_number,'')),'[^A-Z0-9]','','g') reg, job_card_number jc, total_invoice_amount amt,
              trim(coalesce(first_name,'')||' '||coalesce(last_name,'')) cust
       FROM public.psf_revenue_dms WHERE nullif(btrim(invoice_number),'') IS NOT NULL ORDER BY upper(btrim(invoice_number)), invoice_date DESC),
x AS (SELECT c.id, c.job_card_no, c.reg_number, regexp_replace(upper(c.reg_number),'[^A-Z0-9]','','g') creg, c.customer_name, c.current_stage, c.created_at::date AS created,
             c.reception_entry_id, r.reg_number AS reception_reg, r.service_type, s.invoice_number, s.invoice_amount,
             dj.rawreg jc_dms_reg, dj.reg jreg, dj.inv jc_dms_invoice, dj.amt jc_dms_amt, dj.cust jc_dms_customer, dj.sr_type jc_dms_type,
             di.rawreg inv_dms_reg, di.reg ireg, di.jc inv_dms_jc, di.cust inv_dms_customer
      FROM live c LEFT JOIN public.service_reception_entries r ON r.id = c.reception_entry_id
      LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id
      LEFT JOIN dj ON dj.jc = upper(btrim(c.job_card_no)) LEFT JOIN di ON di.inv = upper(btrim(s.invoice_number))),
f AS (SELECT x.*, (jreg IS NOT NULL AND jreg NOT IN ('','AF') AND jreg <> creg) AS jc_bad, (ireg IS NOT NULL AND ireg NOT IN ('','AF') AND ireg <> creg) AS inv_bad FROM x),
g AS (SELECT f.*, CASE WHEN jc_bad THEN jreg ELSE ireg END AS treg, CASE WHEN jc_bad THEN jc_dms_customer ELSE inv_dms_customer END AS dms_name FROM f WHERE jc_bad OR inv_bad),
h AS (SELECT g.*, (length(creg)=length(treg) AND (
        (SELECT count(*) FROM generate_series(1,length(creg)) i WHERE substr(creg,i,1)<>substr(treg,i,1)) = 1
        OR ((SELECT count(*) FROM generate_series(1,length(creg)) i WHERE substr(creg,i,1)<>substr(treg,i,1)) = 2
            AND (SELECT string_agg(ch,'' ORDER BY ch) FROM regexp_split_to_table(creg,'') ch) = (SELECT string_agg(ch,'' ORDER BY ch) FROM regexp_split_to_table(treg,'') ch)))) AS typo FROM g)
SELECT h.id AS card, h.job_card_no, h.reg_number, h.customer_name, h.current_stage AS stage, h.created, h.service_type AS reception_type, h.reception_reg,
       CASE WHEN typo THEN 'REG TYPO' ELSE 'DIFFERENT VEHICLE' END AS class,
       CASE WHEN jc_bad AND inv_bad THEN 'job card + invoice' WHEN jc_bad THEN 'job card' ELSE 'invoice' END AS mismatch_in,
       h.invoice_number AS card_invoice, h.invoice_amount AS card_inv_amt,
       h.jc_dms_reg AS dms_reg_for_card_jc, h.jc_dms_customer AS dms_cust_for_card_jc, h.jc_dms_invoice AS dms_inv_for_card_jc, h.jc_dms_amt AS dms_amt_for_card_jc, h.jc_dms_type,
       h.inv_dms_reg AS dms_reg_for_card_invoice, h.inv_dms_jc AS dms_jc_for_card_invoice,
       (SELECT EXISTS (SELECT 1 FROM unnest(string_to_array(lower(regexp_replace(h.customer_name,'[^a-zA-Z ]','','g')),' ')) t WHERE length(t) >= 3 AND position(t in lower(coalesce(h.dms_name,''))) > 0)) AS name_matches_dms,
       (SELECT coalesce(sum(l.amount),0) FROM public.bodyshop_settlement_lines l WHERE l.repair_card_id = h.id AND NOT l.is_reversed AND l.line_type='do_component') AS live_do,
       (SELECT coalesce(sum(l.amount),0) FROM public.bodyshop_settlement_lines l WHERE l.repair_card_id = h.id AND NOT l.is_reversed AND l.line_type='receipt') AS live_receipts,
       (SELECT count(*) FROM public.bodyshop_intake_vehicle_photos p WHERE p.repair_card_id = h.id) AS photos,
       (SELECT count(*) FROM public.bodyshop_repair_card_documents d WHERE d.repair_card_id = h.id) AS docs,
       (SELECT count(*) FROM public.bodyshop_assignments a WHERE a.repair_card_id = h.id) AS assignments,
       (SELECT array_agg(o.id ORDER BY o.id) FROM live o WHERE regexp_replace(upper(o.reg_number),'[^A-Z0-9]','','g') = h.treg AND o.id <> h.id) AS other_live_cards_for_dms_reg,
       CASE WHEN typo THEN 'REG TYPO: correct registration on card to ' || h.treg || ' after checking RC / photo (do not cancel)'
            WHEN inv_bad AND NOT jc_bad THEN 'WRONG INVOICE: card job card matches its vehicle; remove/replace the invoice'
            ELSE 'WRONG JOB CARD / VEHICLE: job card belongs to ' || h.treg || '; find the correct job card (cancel only if it is a duplicate)' END AS suggested
FROM h ORDER BY typo DESC, h.id;

-- QUERY 3: live money lines on those cards (so you can see what would be affected by any fix)
WITH live AS (SELECT * FROM public.bodyshop_repair_cards WHERE overall_status <> 'cancelled'),
dj AS (SELECT DISTINCT ON (upper(btrim(job_card_number))) upper(btrim(job_card_number)) jc, regexp_replace(upper(coalesce(vehicle_registration_number,'')),'[^A-Z0-9]','','g') reg
       FROM public.psf_revenue_dms WHERE nullif(btrim(job_card_number),'') IS NOT NULL ORDER BY upper(btrim(job_card_number)), invoice_date DESC),
di AS (SELECT DISTINCT ON (upper(btrim(invoice_number))) upper(btrim(invoice_number)) inv, regexp_replace(upper(coalesce(vehicle_registration_number,'')),'[^A-Z0-9]','','g') reg
       FROM public.psf_revenue_dms WHERE nullif(btrim(invoice_number),'') IS NOT NULL ORDER BY upper(btrim(invoice_number)), invoice_date DESC),
bad AS (SELECT c.id FROM live c LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id
        LEFT JOIN dj ON dj.jc = upper(btrim(c.job_card_no)) LEFT JOIN di ON di.inv = upper(btrim(s.invoice_number))
        WHERE (dj.reg IS NOT NULL AND dj.reg NOT IN ('','AF') AND dj.reg <> regexp_replace(upper(c.reg_number),'[^A-Z0-9]','','g'))
           OR (di.reg IS NOT NULL AND di.reg NOT IN ('','AF') AND di.reg <> regexp_replace(upper(c.reg_number),'[^A-Z0-9]','','g')))
SELECT l.repair_card_id AS card, l.id AS line_id, l.line_type, l.party, l.component, l.amount, l.txn_date, l.reference, l.voucher_no, l.created_at::date AS posted_on, l.actor_email
FROM bad JOIN public.bodyshop_settlement_lines l ON l.repair_card_id = bad.id AND NOT l.is_reversed AND l.line_type <> 'reversal'
ORDER BY l.repair_card_id, l.id;
