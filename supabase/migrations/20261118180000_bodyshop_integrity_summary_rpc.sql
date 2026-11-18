-- Admin data health: same counts as scripts/bodyshop_integrity_checks.sql query 0 (v2).

CREATE OR REPLACE FUNCTION public.get_bodyshop_integrity_summary()
RETURNS TABLE (
  issue_code text,
  issue_label text,
  issue_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
SET row_security TO off
AS $$
BEGIN
  IF NOT (
    public.is_admin()
    OR public.has_module_view('admin')
    OR public.has_module_modify('admin')
    OR public.has_module_modify('bodyshop_repair')
  ) THEN
    RAISE EXCEPTION 'permission denied: admin or bodyshop_repair modify required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
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
                 ELSE 'small' END tier FROM money),
  raw AS (
    SELECT * FROM (
      SELECT 'T1' AS issue, 'T1   same invoice on 2+ live cards' AS lbl, count(*)::bigint n FROM (SELECT 1 FROM si WHERE nullif(btrim(invoice_number),'') IS NOT NULL GROUP BY upper(btrim(invoice_number)) HAVING count(*)>1) x
      UNION ALL SELECT 'T2a', 'T2a  invoice vehicle differs: registration typo (fix reg on card)', count(*)::bigint FROM sict WHERE in_dms AND dreg NOT IN ('','AF') AND dreg<>creg AND typo
      UNION ALL SELECT 'T2b', 'T2b  invoice DMS reg blank/AF (cannot verify)', count(*)::bigint FROM sic WHERE in_dms AND dreg IN ('','AF') AND creg<>''
      UNION ALL SELECT 'T2c', 'T2c  invoice belongs to a DIFFERENT vehicle in DMS', count(*)::bigint FROM sict WHERE in_dms AND dreg NOT IN ('','AF') AND dreg<>creg AND NOT typo
      UNION ALL SELECT 'T3', 'T3   invoice is on a different JC in DMS (same reg)', count(*)::bigint FROM sic WHERE in_dms AND dreg=creg AND djc<>upper(btrim(job_card_no)) AND NOT is_placeholder
      UNION ALL SELECT 'T3b-twin', 'T3b  placeholder card, DMS has real JC, TWIN card holds that JC', count(*)::bigint FROM sic WHERE in_dms AND is_placeholder AND djc<>creg AND EXISTS (SELECT 1 FROM live t WHERE upper(btrim(t.job_card_no))=sic.djc AND t.id<>sic.id)
      UNION ALL SELECT 'T3b', 'T3b  placeholder card, DMS has real JC, NO twin (write real JC on card)', count(*)::bigint FROM sic WHERE in_dms AND is_placeholder AND djc<>creg AND NOT EXISTS (SELECT 1 FROM live t WHERE upper(btrim(t.job_card_no))=sic.djc AND t.id<>sic.id)
      UNION ALL SELECT 'T4', 'T4   invoice number not found in DMS', count(*)::bigint FROM si WHERE nullif(btrim(invoice_number),'') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dms d WHERE d.inv=upper(btrim(si.invoice_number)))
      UNION ALL SELECT 'T5', 'T5   real job card number on 2+ live cards', count(*)::bigint FROM (SELECT 1 FROM live WHERE upper(btrim(job_card_no))<>regexp_replace(upper(reg_number),'[^A-Z0-9]','','g') GROUP BY upper(btrim(job_card_no)) HAVING count(*)>1) x
      UNION ALL SELECT 'T6', 'T6   same job card seq on 2+ live cards (year part differs)', count(*)::bigint FROM (SELECT 1 FROM live WHERE job_card_no ~ '^JC-' GROUP BY regexp_replace(upper(job_card_no),'-26[0-9]{2}-','-YYYY-') HAVING count(*)>1) x
      UNION ALL SELECT 'T7', 'T7   2+ live placeholder cards, same reg', count(*)::bigint FROM (SELECT 1 FROM live WHERE upper(btrim(job_card_no))=regexp_replace(upper(reg_number),'[^A-Z0-9]','','g') OR upper(btrim(job_card_no))=upper(btrim(reg_number)) GROUP BY upper(btrim(reg_number)) HAVING count(*)>1) x
      UNION ALL SELECT 'T8a', 'T8a  card JC is on another registration in DMS: typo (fix reg on card)', count(*)::bigint FROM jctt WHERE typo
      UNION ALL SELECT 'T8c', 'T8c  card JC belongs to a DIFFERENT vehicle in DMS', count(*)::bigint FROM jctt WHERE NOT typo
      UNION ALL SELECT 'T9', 'T9   same payment reference on 2+ CARDS (generic refs excluded)', count(*)::bigint FROM (SELECT 1 FROM public.bodyshop_settlement_lines WHERE line_type='receipt' AND NOT is_reversed AND nullif(btrim(reference),'') IS NOT NULL AND upper(btrim(reference)) NOT IN ('DISCOUNT','CASH','NA','N/A','-') AND upper(btrim(reference)) NOT LIKE 'BY TRANSFER%' GROUP BY upper(btrim(reference)) HAVING count(DISTINCT repair_card_id)>1) x
      UNION ALL SELECT 'T10', 'T10  same date+amount receipt on 2+ cards of one reg', count(*)::bigint FROM (SELECT 1 FROM public.bodyshop_settlement_lines l JOIN public.bodyshop_repair_cards c ON c.id=l.repair_card_id WHERE l.line_type='receipt' AND NOT l.is_reversed AND c.overall_status<>'cancelled' GROUP BY upper(btrim(c.reg_number)), l.txn_date, l.amount HAVING count(DISTINCT c.id)>1) x
      UNION ALL SELECT 'T11', 'T11  live DO posted > invoice amount (+Rs1)', count(*)::bigint FROM moneyt WHERE do_amt > inv+1
      UNION ALL SELECT 'T12a', 'T12a money over invoice: rounding (<= Rs15)', count(*)::bigint FROM moneyt WHERE tier='rounding'
      UNION ALL SELECT 'T12b', 'T12b money over invoice: small (<=10% or <=Rs1000)', count(*)::bigint FROM moneyt WHERE tier='small'
      UNION ALL SELECT 'T12c', 'T12c money over invoice: LARGE (>10% and >Rs1000)', count(*)::bigint FROM moneyt WHERE tier='large'
      UNION ALL SELECT 'T13', 'T13  invoice amount differs from DMS, no reason recorded', count(*)::bigint FROM sic WHERE in_dms AND abs(coalesce(invoice_amount,0)-coalesce(damt,0))>1 AND nullif(btrim(invoice_amount_variance_reason),'') IS NULL
      UNION ALL SELECT 'T14', 'T14  settlement.job_card_no differs from card.job_card_no', count(*)::bigint FROM si JOIN public.bodyshop_settlements s ON s.id=si.sid WHERE upper(btrim(coalesce(s.job_card_no,'')))<>upper(btrim(si.job_card_no))
      UNION ALL SELECT 'T15', 'T15  cancelled card still holding live money lines', count(DISTINCT c.id)::bigint FROM public.bodyshop_repair_cards c JOIN public.bodyshop_settlement_lines l ON l.repair_card_id=c.id WHERE c.overall_status='cancelled' AND NOT l.is_reversed AND l.line_type<>'reversal'
      UNION ALL SELECT 'T16a', 'T16a bad job card format (not JC-MBTPLT-JPn-YYYY-nnnnnn or placeholder)', count(*)::bigint FROM live WHERE upper(btrim(job_card_no))<>regexp_replace(upper(reg_number),'[^A-Z0-9]','','g') AND upper(btrim(job_card_no))<>upper(btrim(reg_number)) AND job_card_no !~ '^JC-MBTPLT-JP[12]-[0-9]{4}-[0-9]{6}$'
      UNION ALL SELECT 'T16b', 'T16b bad invoice format (not [IE]MBTAI + 10 digits)', count(*)::bigint FROM si WHERE nullif(btrim(invoice_number),'') IS NOT NULL AND upper(btrim(invoice_number)) !~ '^[IE]MBTAI[0-9]{10}$'
      UNION ALL SELECT 'T17', 'T17  overshooting card holds a receipt equal to ANOTHER card''s invoice', count(DISTINCT m.id)::bigint FROM moneyt m JOIN public.bodyshop_settlement_lines l ON l.repair_card_id=m.id AND l.line_type='receipt' AND NOT l.is_reversed AND l.amount>=1000 AND l.amount % 500 <> 0 JOIN si o ON o.id<>m.id AND o.invoice_amount=l.amount WHERE m.tier IN ('small','large') AND l.amount<>m.inv
    ) q
  )
  SELECT r.issue::text, r.lbl::text, r.n
  FROM raw r
  ORDER BY r.issue;
END;
$$;

COMMENT ON FUNCTION public.get_bodyshop_integrity_summary() IS
  'Live-card integrity issue counts (v2). Matches scripts/bodyshop_integrity_checks.sql summary. Admin / bodyshop_repair modify.';

REVOKE ALL ON FUNCTION public.get_bodyshop_integrity_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_bodyshop_integrity_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bodyshop_integrity_summary() TO service_role;