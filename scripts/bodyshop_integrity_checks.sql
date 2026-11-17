-- BODYSHOP integrity checks (READ-ONLY, v2 2026-11-17). Each numbered block is self-contained: run one at a time in the Supabase SQL Editor.
-- "live card" = overall_status <> 'cancelled'. "placeholder JC" = job_card_no equals the registration (no real job card yet).
-- Same vehicle with several cards over time is NORMAL and is never flagged; only shared job card / invoice / payment keys are.
-- Registration typo test (no extension needed): same length and either 1 differing character, or 2 differing characters that are a swap.
-- Fix plan: docs/BODYSHOP_INTEGRITY_FIX_PLAN.md

-- ===== 0. SUMMARY: how many rows each issue type has ======================================
WITH live AS (SELECT * FROM public.bodyshop_repair_cards WHERE overall_status <> 'cancelled'),
dms AS (SELECT DISTINCT ON (upper(btrim(invoice_number))) upper(btrim(invoice_number)) inv, upper(btrim(job_card_number)) jc,
               regexp_replace(upper(coalesce(vehicle_registration_number,'')),'[^A-Z0-9]','','g') reg, total_invoice_amount amt
        FROM public.psf_revenue_dms WHERE nullif(btrim(invoice_number),'') IS NOT NULL ORDER BY upper(btrim(invoice_number)), invoice_date DESC),
dmsjc AS (SELECT DISTINCT ON (upper(btrim(job_card_number))) upper(btrim(job_card_number)) jc,
               regexp_replace(upper(coalesce(vehicle_registration_number,'')),'[^A-Z0-9]','','g') reg
        FROM public.psf_revenue_dms WHERE nullif(btrim(job_card_number),'') IS NOT NULL ORDER BY upper(btrim(job_card_number)), invoice_date DESC),
si AS (SELECT c.id, c.job_card_no, c.reg_number, regexp_replace(upper(c.reg_number),'[^A-Z0-9]','','g') creg, s.invoice_number, s.invoice_amount, s.invoice_amount_variance_reason, s.id sid
       FROM live c JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id),
sic AS (SELECT si.*, d.reg dreg, d.jc djc, d.amt damt, (d.inv IS NOT NULL) in_dms,
          (upper(btrim(si.job_card_no)) = si.creg) AS is_placeholder FROM si LEFT JOIN dms d ON d.inv = upper(btrim(si.invoice_number))),
sict AS (SELECT sic.*, h.typo FROM sic
          CROSS JOIN LATERAL (SELECT (length(sic.creg)=length(sic.dreg) AND (
              (SELECT count(*) FROM generate_series(1,length(sic.creg)) i WHERE substr(sic.creg,i,1)<>substr(sic.dreg,i,1)) = 1
              OR ((SELECT count(*) FROM generate_series(1,length(sic.creg)) i WHERE substr(sic.creg,i,1)<>substr(sic.dreg,i,1)) = 2
                  AND (SELECT string_agg(ch,'' ORDER BY ch) FROM regexp_split_to_table(sic.creg,'') ch) = (SELECT string_agg(ch,'' ORDER BY ch) FROM regexp_split_to_table(sic.dreg,'') ch)))) AS typo) h),
jct AS (SELECT c.id, c.job_card_no, c.reg_number, j.reg dreg, regexp_replace(upper(c.reg_number),'[^A-Z0-9]','','g') creg FROM live c JOIN dmsjc j ON j.jc = upper(btrim(c.job_card_no))),
jctt AS (SELECT jct.*, h.typo FROM jct
          CROSS JOIN LATERAL (SELECT (length(jct.creg)=length(jct.dreg) AND (
              (SELECT count(*) FROM generate_series(1,length(jct.creg)) i WHERE substr(jct.creg,i,1)<>substr(jct.dreg,i,1)) = 1
              OR ((SELECT count(*) FROM generate_series(1,length(jct.creg)) i WHERE substr(jct.creg,i,1)<>substr(jct.dreg,i,1)) = 2
                  AND (SELECT string_agg(ch,'' ORDER BY ch) FROM regexp_split_to_table(jct.creg,'') ch) = (SELECT string_agg(ch,'' ORDER BY ch) FROM regexp_split_to_table(jct.dreg,'') ch)))) AS typo) h
         WHERE jct.dreg NOT IN ('','AF') AND jct.dreg <> jct.creg),
money AS (SELECT si.*, coalesce(si.invoice_amount,0) inv,
          (SELECT coalesce(sum(amount),0) FROM public.bodyshop_settlement_lines l WHERE l.repair_card_id=si.id AND l.line_type='do_component' AND NOT l.is_reversed) do_amt,
          (SELECT coalesce(sum(amount),0) FROM public.bodyshop_settlement_lines l WHERE l.repair_card_id=si.id AND l.line_type='receipt' AND NOT l.is_reversed) rcpt FROM si),
moneyt AS (SELECT money.*, (do_amt+rcpt-inv) over_by,
          CASE WHEN do_amt+rcpt-inv <= 1 THEN NULL
               WHEN do_amt+rcpt-inv <= 15 THEN 'rounding'
               WHEN do_amt+rcpt-inv > 1000 AND (inv = 0 OR do_amt+rcpt-inv > 0.10*inv) THEN 'large'
               ELSE 'small' END tier FROM money)
SELECT * FROM (
 SELECT 'T1   same invoice on 2+ live cards' AS issue, count(*) n FROM (SELECT 1 FROM si WHERE nullif(btrim(invoice_number),'') IS NOT NULL GROUP BY upper(btrim(invoice_number)) HAVING count(*)>1) x
 UNION ALL SELECT 'T2a  invoice vehicle differs: registration typo (fix reg on card)', count(*) FROM sict WHERE in_dms AND dreg NOT IN ('','AF') AND dreg<>creg AND typo
 UNION ALL SELECT 'T2b  invoice DMS reg blank/AF (cannot verify)', count(*) FROM sic WHERE in_dms AND dreg IN ('','AF') AND creg<>''
 UNION ALL SELECT 'T2c  invoice belongs to a DIFFERENT vehicle in DMS', count(*) FROM sict WHERE in_dms AND dreg NOT IN ('','AF') AND dreg<>creg AND NOT typo
 UNION ALL SELECT 'T3   invoice is on a different JC in DMS (same reg)', count(*) FROM sic WHERE in_dms AND dreg=creg AND djc<>upper(btrim(job_card_no)) AND NOT is_placeholder
 UNION ALL SELECT 'T3b  placeholder card, DMS has real JC, TWIN card holds that JC', count(*) FROM sic WHERE in_dms AND is_placeholder AND djc<>creg AND EXISTS (SELECT 1 FROM live t WHERE upper(btrim(t.job_card_no))=sic.djc AND t.id<>sic.id)
 UNION ALL SELECT 'T3b  placeholder card, DMS has real JC, NO twin (write real JC on card)', count(*) FROM sic WHERE in_dms AND is_placeholder AND djc<>creg AND NOT EXISTS (SELECT 1 FROM live t WHERE upper(btrim(t.job_card_no))=sic.djc AND t.id<>sic.id)
 UNION ALL SELECT 'T4   invoice number not found in DMS', count(*) FROM si WHERE nullif(btrim(invoice_number),'') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dms d WHERE d.inv=upper(btrim(si.invoice_number)))
 UNION ALL SELECT 'T5   real job card number on 2+ live cards', count(*) FROM (SELECT 1 FROM live WHERE upper(btrim(job_card_no))<>regexp_replace(upper(reg_number),'[^A-Z0-9]','','g') GROUP BY upper(btrim(job_card_no)) HAVING count(*)>1) x
 UNION ALL SELECT 'T6   same job card seq on 2+ live cards (year part differs)', count(*) FROM (SELECT 1 FROM live WHERE job_card_no ~ '^JC-' GROUP BY regexp_replace(upper(job_card_no),'-26[0-9]{2}-','-YYYY-') HAVING count(*)>1) x
 UNION ALL SELECT 'T7   2+ live placeholder cards, same reg', count(*) FROM (SELECT 1 FROM live WHERE upper(btrim(job_card_no))=regexp_replace(upper(reg_number),'[^A-Z0-9]','','g') OR upper(btrim(job_card_no))=upper(btrim(reg_number)) GROUP BY upper(btrim(reg_number)) HAVING count(*)>1) x
 UNION ALL SELECT 'T8a  card JC is on another registration in DMS: typo (fix reg on card)', count(*) FROM jctt WHERE typo
 UNION ALL SELECT 'T8c  card JC belongs to a DIFFERENT vehicle in DMS', count(*) FROM jctt WHERE NOT typo
 UNION ALL SELECT 'T9   same payment reference on 2+ CARDS (generic refs excluded)', count(*) FROM (SELECT 1 FROM public.bodyshop_settlement_lines WHERE line_type='receipt' AND NOT is_reversed AND nullif(btrim(reference),'') IS NOT NULL AND upper(btrim(reference)) NOT IN ('DISCOUNT','CASH','NA','N/A','-') AND upper(btrim(reference)) NOT LIKE 'BY TRANSFER%' GROUP BY upper(btrim(reference)) HAVING count(DISTINCT repair_card_id)>1) x
 UNION ALL SELECT 'T10  same date+amount receipt on 2+ cards of one reg', count(*) FROM (SELECT 1 FROM public.bodyshop_settlement_lines l JOIN public.bodyshop_repair_cards c ON c.id=l.repair_card_id WHERE l.line_type='receipt' AND NOT l.is_reversed AND c.overall_status<>'cancelled' GROUP BY upper(btrim(c.reg_number)), l.txn_date, l.amount HAVING count(DISTINCT c.id)>1) x
 UNION ALL SELECT 'T11  live DO posted > invoice amount (+Rs1)', count(*) FROM moneyt WHERE do_amt > inv+1
 UNION ALL SELECT 'T12a money over invoice: rounding (<= Rs15)', count(*) FROM moneyt WHERE tier='rounding'
 UNION ALL SELECT 'T12b money over invoice: small (<=10% or <=Rs1000)', count(*) FROM moneyt WHERE tier='small'
 UNION ALL SELECT 'T12c money over invoice: LARGE (>10% and >Rs1000)', count(*) FROM moneyt WHERE tier='large'
 UNION ALL SELECT 'T13  invoice amount differs from DMS, no reason recorded', count(*) FROM sic WHERE in_dms AND abs(coalesce(invoice_amount,0)-coalesce(damt,0))>1 AND nullif(btrim(invoice_amount_variance_reason),'') IS NULL
 UNION ALL SELECT 'T14  settlement.job_card_no differs from card.job_card_no', count(*) FROM si JOIN public.bodyshop_settlements s ON s.id=si.sid WHERE upper(btrim(coalesce(s.job_card_no,'')))<>upper(btrim(si.job_card_no))
 UNION ALL SELECT 'T15  cancelled card still holding live money lines', count(DISTINCT c.id) FROM public.bodyshop_repair_cards c JOIN public.bodyshop_settlement_lines l ON l.repair_card_id=c.id WHERE c.overall_status='cancelled' AND NOT l.is_reversed AND l.line_type<>'reversal'
 UNION ALL SELECT 'T16a bad job card format (not JC-MBTPLT-JPn-YYYY-nnnnnn or placeholder)', count(*) FROM live WHERE upper(btrim(job_card_no))<>regexp_replace(upper(reg_number),'[^A-Z0-9]','','g') AND upper(btrim(job_card_no))<>upper(btrim(reg_number)) AND job_card_no !~ '^JC-MBTPLT-JP[12]-[0-9]{4}-[0-9]{6}$'
 UNION ALL SELECT 'T16b bad invoice format (not [IE]MBTAI + 10 digits)', count(*) FROM si WHERE nullif(btrim(invoice_number),'') IS NOT NULL AND upper(btrim(invoice_number)) !~ '^[IE]MBTAI[0-9]{10}$'
 UNION ALL SELECT 'T17  overshooting card holds a receipt equal to ANOTHER card''s invoice', count(DISTINCT m.id) FROM moneyt m JOIN public.bodyshop_settlement_lines l ON l.repair_card_id=m.id AND l.line_type='receipt' AND NOT l.is_reversed AND l.amount>=1000 AND l.amount % 500 <> 0 JOIN si o ON o.id<>m.id AND o.invoice_amount=l.amount WHERE m.tier IN ('small','large') AND l.amount<>m.inv
) t ORDER BY 1;

-- ===== DETAIL queries: run one at a time ===================================================
-- 1) T1 shared invoices
SELECT upper(btrim(s.invoice_number)) inv, count(*) n, array_agg(c.id ORDER BY c.id) cards, array_agg(c.job_card_no ORDER BY c.id) jcs, array_agg(c.reg_number ORDER BY c.id) regs
FROM public.bodyshop_settlements s JOIN public.bodyshop_repair_cards c ON c.id=s.repair_card_id
WHERE c.overall_status<>'cancelled' AND nullif(btrim(s.invoice_number),'') IS NOT NULL GROUP BY 1 HAVING count(*)>1 ORDER BY 1;

-- 2) per-card DMS comparison. Filter the 'verdict' column (everything except 'ok'):
--    T4, T2b, T2a typo, T2c different, T3b twin / no twin (twin_card_id filled), T3
WITH dms AS (SELECT DISTINCT ON (upper(btrim(invoice_number))) upper(btrim(invoice_number)) inv, upper(btrim(job_card_number)) jc,
               regexp_replace(upper(coalesce(vehicle_registration_number,'')),'[^A-Z0-9]','','g') reg, vehicle_registration_number rawreg, total_invoice_amount amt
        FROM public.psf_revenue_dms WHERE nullif(btrim(invoice_number),'') IS NOT NULL ORDER BY upper(btrim(invoice_number)), invoice_date DESC),
base AS (SELECT c.id, c.job_card_no, c.reg_number, regexp_replace(upper(c.reg_number),'[^A-Z0-9]','','g') creg, s.invoice_number, s.invoice_amount,
                d.inv IS NOT NULL in_dms, d.jc djc, d.reg dreg, d.rawreg, d.amt damt
         FROM public.bodyshop_repair_cards c JOIN public.bodyshop_settlements s ON s.repair_card_id=c.id
         LEFT JOIN dms d ON d.inv=upper(btrim(s.invoice_number))
         WHERE c.overall_status<>'cancelled' AND nullif(btrim(s.invoice_number),'') IS NOT NULL)
SELECT b.id, b.job_card_no, b.reg_number, b.invoice_number, b.invoice_amount, b.djc dms_jc, b.rawreg dms_reg, b.damt dms_amt,
 (SELECT t.id FROM public.bodyshop_repair_cards t WHERE t.overall_status<>'cancelled' AND upper(btrim(t.job_card_no))=b.djc AND t.id<>b.id LIMIT 1) AS twin_card_id,
 CASE WHEN NOT b.in_dms THEN 'T4 not in DMS'
      WHEN b.dreg IN ('','AF') THEN 'T2b DMS reg blank/AF'
      WHEN b.dreg<>b.creg AND h.typo THEN 'T2a registration typo (fix reg on card)'
      WHEN b.dreg<>b.creg THEN 'T2c different vehicle'
      WHEN upper(btrim(b.job_card_no))=b.creg AND b.djc<>b.creg AND EXISTS (SELECT 1 FROM public.bodyshop_repair_cards t WHERE t.overall_status<>'cancelled' AND upper(btrim(t.job_card_no))=b.djc AND t.id<>b.id) THEN 'T3b placeholder, TWIN holds real JC'
      WHEN upper(btrim(b.job_card_no))=b.creg AND b.djc<>b.creg THEN 'T3b placeholder, no twin (write real JC)'
      WHEN upper(btrim(b.djc))<>upper(btrim(b.job_card_no)) THEN 'T3 other JC same vehicle'
      ELSE 'ok' END verdict
FROM base b CROSS JOIN LATERAL (SELECT (length(b.creg)=length(b.dreg) AND (
   (SELECT count(*) FROM generate_series(1,length(b.creg)) i WHERE substr(b.creg,i,1)<>substr(b.dreg,i,1)) = 1
   OR ((SELECT count(*) FROM generate_series(1,length(b.creg)) i WHERE substr(b.creg,i,1)<>substr(b.dreg,i,1)) = 2
       AND (SELECT string_agg(ch,'' ORDER BY ch) FROM regexp_split_to_table(b.creg,'') ch) = (SELECT string_agg(ch,'' ORDER BY ch) FROM regexp_split_to_table(b.dreg,'') ch)))) AS typo) h
ORDER BY verdict, b.id;

-- 3) T5 / T6 / T7 duplicate job card keys
SELECT 'T5/T7 exact' kind, upper(btrim(job_card_no)) key, count(*) n, array_agg(id ORDER BY id) cards FROM public.bodyshop_repair_cards WHERE overall_status<>'cancelled' GROUP BY 2 HAVING count(*)>1
UNION ALL
SELECT 'T6 year-variant', regexp_replace(upper(job_card_no),'-26[0-9]{2}-','-YYYY-'), count(*), array_agg(id ORDER BY id) FROM public.bodyshop_repair_cards WHERE overall_status<>'cancelled' AND job_card_no ~ '^JC-' GROUP BY 2 HAVING count(*)>1;

-- 4) T8 card's job card is on another vehicle in DMS, with class (typo vs different vehicle)
WITH x AS (SELECT c.id, c.job_card_no, c.reg_number, c.current_stage, d.vehicle_registration_number dms_reg, d.invoice_number dms_invoice, d.total_invoice_amount,
        regexp_replace(upper(c.reg_number),'[^A-Z0-9]','','g') creg, regexp_replace(upper(d.vehicle_registration_number),'[^A-Z0-9]','','g') dreg
 FROM public.bodyshop_repair_cards c JOIN public.psf_revenue_dms d ON upper(btrim(d.job_card_number))=upper(btrim(c.job_card_no))
 WHERE c.overall_status<>'cancelled')
SELECT x.id, x.job_card_no, x.reg_number, x.current_stage, x.dms_reg, x.dms_invoice, x.total_invoice_amount,
  CASE WHEN length(x.creg)=length(x.dreg) AND (
   (SELECT count(*) FROM generate_series(1,length(x.creg)) i WHERE substr(x.creg,i,1)<>substr(x.dreg,i,1)) = 1
   OR ((SELECT count(*) FROM generate_series(1,length(x.creg)) i WHERE substr(x.creg,i,1)<>substr(x.dreg,i,1)) = 2
       AND (SELECT string_agg(ch,'' ORDER BY ch) FROM regexp_split_to_table(x.creg,'') ch) = (SELECT string_agg(ch,'' ORDER BY ch) FROM regexp_split_to_table(x.dreg,'') ch)))
  THEN 'T8a registration typo' ELSE 'T8c different vehicle' END class
FROM x WHERE x.dreg NOT IN ('','AF') AND x.dreg<>x.creg ORDER BY class, x.id;

-- 5) T9 same payment reference on 2+ different cards (generic references and same-card repeats excluded)
SELECT upper(btrim(l.reference)) ref, count(*) n, array_agg(l.repair_card_id ORDER BY l.id) cards, array_agg(l.amount ORDER BY l.id) amts, array_agg(l.voucher_no ORDER BY l.id) vouchers
FROM public.bodyshop_settlement_lines l
WHERE l.line_type='receipt' AND NOT l.is_reversed AND nullif(btrim(l.reference),'') IS NOT NULL
  AND upper(btrim(l.reference)) NOT IN ('DISCOUNT','CASH','NA','N/A','-') AND upper(btrim(l.reference)) NOT LIKE 'BY TRANSFER%'
GROUP BY 1 HAVING count(DISTINCT l.repair_card_id)>1;

-- 6) T10 same reg + date + amount on 2+ cards (likely the same payment posted twice)
SELECT upper(btrim(c.reg_number)) reg, l.txn_date, l.amount, array_agg(DISTINCT c.id) cards, array_agg(l.reference) refs, array_agg(l.voucher_no) vouchers
FROM public.bodyshop_settlement_lines l JOIN public.bodyshop_repair_cards c ON c.id=l.repair_card_id
WHERE l.line_type='receipt' AND NOT l.is_reversed AND c.overall_status<>'cancelled' GROUP BY 1,2,3 HAVING count(DISTINCT c.id)>1;

-- 7) T11 / T12 money posted beyond the invoice, with tier and kind (review 'large' first)
WITH m AS (SELECT c.id, c.job_card_no, c.reg_number, s.invoice_number, coalesce(s.invoice_amount,0) inv,
  (SELECT coalesce(sum(amount),0) FROM public.bodyshop_settlement_lines l WHERE l.repair_card_id=c.id AND l.line_type='do_component' AND NOT l.is_reversed) live_do,
  (SELECT coalesce(sum(amount),0) FROM public.bodyshop_settlement_lines l WHERE l.repair_card_id=c.id AND l.line_type='receipt' AND NOT l.is_reversed) live_receipts
 FROM public.bodyshop_repair_cards c JOIN public.bodyshop_settlements s ON s.repair_card_id=c.id WHERE c.overall_status<>'cancelled')
SELECT m.*, (live_do+live_receipts-inv) AS over_by, round(100*(live_do+live_receipts-inv)/nullif(inv,0),1) AS over_pct,
  CASE WHEN live_do+live_receipts-inv <= 15 THEN 'rounding'
       WHEN live_do+live_receipts-inv > 1000 AND (inv=0 OR live_do+live_receipts-inv > 0.10*inv) THEN 'large' ELSE 'small' END AS tier,
  CASE WHEN live_do > inv+1 THEN 'DO above invoice' WHEN live_do = 0 THEN 'receipts only above invoice' ELSE 'DO+receipts above invoice' END AS kind
FROM m WHERE live_do+live_receipts > inv+1
ORDER BY CASE WHEN live_do+live_receipts-inv > 1000 AND (inv=0 OR live_do+live_receipts-inv > 0.10*inv) THEN 0 ELSE 1 END, (live_do+live_receipts-inv) DESC;

-- 8) T16 format problems on job card number and invoice number
SELECT c.id, c.job_card_no, c.reg_number, s.invoice_number,
  CASE WHEN upper(btrim(c.job_card_no))<>regexp_replace(upper(c.reg_number),'[^A-Z0-9]','','g') AND upper(btrim(c.job_card_no))<>upper(btrim(c.reg_number)) AND c.job_card_no !~ '^JC-MBTPLT-JP[12]-[0-9]{4}-[0-9]{6}$' THEN 'T16a bad job card format' END AS jc_flag,
  CASE WHEN nullif(btrim(s.invoice_number),'') IS NOT NULL AND upper(btrim(s.invoice_number)) !~ '^[IE]MBTAI[0-9]{10}$' THEN 'T16b bad invoice format' END AS inv_flag
FROM public.bodyshop_repair_cards c LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id=c.id
WHERE c.overall_status<>'cancelled' AND (
  (upper(btrim(c.job_card_no))<>regexp_replace(upper(c.reg_number),'[^A-Z0-9]','','g') AND upper(btrim(c.job_card_no))<>upper(btrim(c.reg_number)) AND c.job_card_no !~ '^JC-MBTPLT-JP[12]-[0-9]{4}-[0-9]{6}$')
  OR (nullif(btrim(s.invoice_number),'') IS NOT NULL AND upper(btrim(s.invoice_number)) !~ '^[IE]MBTAI[0-9]{10}$'))
ORDER BY c.id;

-- 9) T17 receipts that match ANOTHER card's invoice amount, on cards that already overshoot their own invoice
WITH m AS (SELECT c.id, coalesce(s.invoice_amount,0) inv,
  (SELECT coalesce(sum(amount),0) FROM public.bodyshop_settlement_lines l WHERE l.repair_card_id=c.id AND l.line_type IN ('do_component','receipt') AND NOT l.is_reversed) posted
 FROM public.bodyshop_repair_cards c JOIN public.bodyshop_settlements s ON s.repair_card_id=c.id WHERE c.overall_status<>'cancelled')
SELECT m.id AS receipt_card, m.inv AS own_invoice, m.posted, l.id AS line_id, l.amount, l.txn_date, l.reference, l.voucher_no,
       o.repair_card_id AS card_with_that_invoice, o.job_card_no AS that_jc, o.invoice_number AS that_invoice
FROM m JOIN public.bodyshop_settlement_lines l ON l.repair_card_id=m.id AND l.line_type='receipt' AND NOT l.is_reversed AND l.amount>=1000 AND l.amount % 500 <> 0
JOIN public.bodyshop_settlements o ON o.repair_card_id<>m.id AND o.invoice_amount=l.amount
JOIN public.bodyshop_repair_cards oc ON oc.id=o.repair_card_id AND oc.overall_status<>'cancelled'
WHERE m.posted > m.inv+15 AND l.amount<>m.inv ORDER BY m.id;
