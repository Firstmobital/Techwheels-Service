-- BATCH B4 (REG TYPO): correct registration to DMS on cards 751, 1047, 1134, 1253 (owner validated 18-Nov-2026).
-- EXECUTED 18-Nov-2026: dry_run true -> DRY RUN OK (1253+1219 on 25BH5863Q, B2 REG TYPO 0); dry_run false -> SAVED.
-- Updates bodyshop_repair_cards, service_reception_entries, and intake photos only (no money changes).
-- Card 1253: live card 1219 also on 25BH5863Q is expected (second visit on same vehicle).
-- dry_run = true raises on purpose and saves nothing; set to false for the real run.
DO $$
DECLARE
  dry_run constant boolean := true; -- real run done 18-Nov-2026 (see plan tracker B4)
  rows_changed int; live_n int; live_do numeric; live_rcpt numeric;
  b2_typo int; report text;
BEGIN
  -- 751: 26BH4710G -> 26BH4701G
  IF (SELECT overall_status FROM public.bodyshop_repair_cards WHERE id = 751) <> 'active'
     OR (SELECT reg_number FROM public.bodyshop_repair_cards WHERE id = 751) <> '26BH4710G'
     OR (SELECT job_card_no FROM public.bodyshop_repair_cards WHERE id = 751) <> 'JC-MBTPLT-JP1-2627-005790'
     OR (SELECT reception_entry_id FROM public.bodyshop_repair_cards WHERE id = 751) <> 6368 THEN
    RAISE EXCEPTION 'card 751 is not in the audited state - stop';
  END IF;
  IF (SELECT invoice_number FROM public.bodyshop_settlements WHERE repair_card_id = 751) IS DISTINCT FROM 'IMBTAI2627006235'
     OR (SELECT invoice_amount FROM public.bodyshop_settlements WHERE repair_card_id = 751) IS DISTINCT FROM 13566.00 THEN
    RAISE EXCEPTION 'invoice on 751 is not audited - stop';
  END IF;
  SELECT count(*), coalesce(sum(amount) FILTER (WHERE line_type='do_component'),0),
         coalesce(sum(amount) FILTER (WHERE line_type='receipt'),0)
  INTO live_n, live_do, live_rcpt FROM public.bodyshop_settlement_lines
  WHERE repair_card_id = 751 AND NOT is_reversed AND line_type <> 'reversal';
  IF live_n <> 1 OR live_rcpt <> 19483.00 OR live_do <> 0 THEN
    RAISE EXCEPTION 'card 751 live money not audited - stop';
  END IF;
  IF (SELECT count(*) FROM public.bodyshop_intake_vehicle_photos WHERE repair_card_id = 751) <> 9
     OR (SELECT count(*) FROM public.bodyshop_repair_card_documents WHERE repair_card_id = 751) <> 2
     OR (SELECT count(*) FROM public.bodyshop_assignments WHERE repair_card_id = 751) <> 1 THEN
    RAISE EXCEPTION 'card 751 dependents differ from audit - stop';
  END IF;
  IF exists (SELECT 1 FROM public.bodyshop_repair_cards o WHERE o.overall_status <> 'cancelled' AND o.id <> 751
    AND regexp_replace(upper(o.reg_number),'[^A-Z0-9]','','g') = '26BH4701G') THEN
    RAISE EXCEPTION 'another live card already has 26BH4701G - stop';
  END IF;
  UPDATE public.bodyshop_repair_cards SET reg_number = '26BH4701G' WHERE id = 751 AND reg_number = '26BH4710G';
  GET DIAGNOSTICS rows_changed = ROW_COUNT; IF rows_changed <> 1 THEN RAISE EXCEPTION '751 card rows %', rows_changed; END IF;
  UPDATE public.service_reception_entries SET reg_number = '26BH4701G' WHERE id = 6368 AND reg_number = '26BH4710G';
  GET DIAGNOSTICS rows_changed = ROW_COUNT; IF rows_changed <> 1 THEN RAISE EXCEPTION '751 reception rows %', rows_changed; END IF;
  UPDATE public.bodyshop_intake_vehicle_photos SET reg_number = '26BH4701G' WHERE repair_card_id = 751 AND reg_number = '26BH4710G';
  GET DIAGNOSTICS rows_changed = ROW_COUNT; IF rows_changed <> 9 THEN RAISE EXCEPTION '751 photo rows %', rows_changed; END IF;

  -- 1047: RJO6CG4442 -> RJ06CG4442
  IF (SELECT overall_status FROM public.bodyshop_repair_cards WHERE id = 1047) <> 'active'
     OR (SELECT reg_number FROM public.bodyshop_repair_cards WHERE id = 1047) <> 'RJO6CG4442'
     OR (SELECT job_card_no FROM public.bodyshop_repair_cards WHERE id = 1047) <> 'JC-MBTPLT-JP1-2627-007403'
     OR (SELECT reception_entry_id FROM public.bodyshop_repair_cards WHERE id = 1047) <> 9294 THEN
    RAISE EXCEPTION 'card 1047 is not in the audited state - stop';
  END IF;
  IF (SELECT invoice_number FROM public.bodyshop_settlements WHERE repair_card_id = 1047) IS DISTINCT FROM 'IMBTAI2627008253'
     OR (SELECT invoice_amount FROM public.bodyshop_settlements WHERE repair_card_id = 1047) IS DISTINCT FROM 1541.00 THEN
    RAISE EXCEPTION 'invoice on 1047 is not audited - stop';
  END IF;
  IF (SELECT count(*) FROM public.bodyshop_settlement_lines WHERE repair_card_id = 1047 AND NOT is_reversed AND line_type <> 'reversal') <> 0
     OR (SELECT count(*) FROM public.bodyshop_intake_vehicle_photos WHERE repair_card_id = 1047) <> 8
     OR (SELECT count(*) FROM public.bodyshop_repair_card_documents WHERE repair_card_id = 1047) <> 8
     OR (SELECT count(*) FROM public.bodyshop_assignments WHERE repair_card_id = 1047) <> 1 THEN
    RAISE EXCEPTION 'card 1047 money/dependents differ from audit - stop';
  END IF;
  IF exists (SELECT 1 FROM public.bodyshop_repair_cards o WHERE o.overall_status <> 'cancelled' AND o.id <> 1047
    AND regexp_replace(upper(o.reg_number),'[^A-Z0-9]','','g') = 'RJ06CG4442') THEN
    RAISE EXCEPTION 'another live card already has RJ06CG4442 - stop';
  END IF;
  UPDATE public.bodyshop_repair_cards SET reg_number = 'RJ06CG4442' WHERE id = 1047 AND reg_number = 'RJO6CG4442';
  GET DIAGNOSTICS rows_changed = ROW_COUNT; IF rows_changed <> 1 THEN RAISE EXCEPTION '1047 card rows %', rows_changed; END IF;
  UPDATE public.service_reception_entries SET reg_number = 'RJ06CG4442' WHERE id = 9294 AND reg_number = 'RJO6CG4442';
  GET DIAGNOSTICS rows_changed = ROW_COUNT; IF rows_changed <> 1 THEN RAISE EXCEPTION '1047 reception rows %', rows_changed; END IF;
  UPDATE public.bodyshop_intake_vehicle_photos SET reg_number = 'RJ06CG4442' WHERE repair_card_id = 1047 AND reg_number = 'RJO6CG4442';
  GET DIAGNOSTICS rows_changed = ROW_COUNT; IF rows_changed <> 8 THEN RAISE EXCEPTION '1047 photo rows %', rows_changed; END IF;

  -- 1134: RJ60CJ9064 -> RJ60CK9064
  IF (SELECT overall_status FROM public.bodyshop_repair_cards WHERE id = 1134) <> 'active'
     OR (SELECT reg_number FROM public.bodyshop_repair_cards WHERE id = 1134) <> 'RJ60CJ9064'
     OR (SELECT job_card_no FROM public.bodyshop_repair_cards WHERE id = 1134) <> 'JC-MBTPLT-JP2-2627-007141'
     OR (SELECT reception_entry_id FROM public.bodyshop_repair_cards WHERE id = 1134) <> 9980 THEN
    RAISE EXCEPTION 'card 1134 is not in the audited state - stop';
  END IF;
  IF (SELECT invoice_number FROM public.bodyshop_settlements WHERE repair_card_id = 1134) IS DISTINCT FROM 'EMBTAI2627007359'
     OR (SELECT invoice_amount FROM public.bodyshop_settlements WHERE repair_card_id = 1134) IS DISTINCT FROM 20643.00 THEN
    RAISE EXCEPTION 'invoice on 1134 is not audited - stop';
  END IF;
  SELECT count(*), coalesce(sum(amount) FILTER (WHERE line_type='do_component'),0),
         coalesce(sum(amount) FILTER (WHERE line_type='receipt'),0)
  INTO live_n, live_do, live_rcpt FROM public.bodyshop_settlement_lines
  WHERE repair_card_id = 1134 AND NOT is_reversed AND line_type <> 'reversal';
  IF live_n <> 2 OR live_do <> 18129.99 OR live_rcpt <> 0 THEN
    RAISE EXCEPTION 'card 1134 live money not audited (do=%) - stop', live_do;
  END IF;
  IF (SELECT count(*) FROM public.bodyshop_intake_vehicle_photos WHERE repair_card_id = 1134) <> 1
     OR (SELECT count(*) FROM public.bodyshop_repair_card_documents WHERE repair_card_id = 1134) <> 11
     OR (SELECT count(*) FROM public.bodyshop_assignments WHERE repair_card_id = 1134) <> 1 THEN
    RAISE EXCEPTION 'card 1134 dependents differ from audit - stop';
  END IF;
  IF exists (SELECT 1 FROM public.bodyshop_repair_cards o WHERE o.overall_status <> 'cancelled' AND o.id <> 1134
    AND regexp_replace(upper(o.reg_number),'[^A-Z0-9]','','g') = 'RJ60CK9064') THEN
    RAISE EXCEPTION 'another live card already has RJ60CK9064 - stop';
  END IF;
  UPDATE public.bodyshop_repair_cards SET reg_number = 'RJ60CK9064' WHERE id = 1134 AND reg_number = 'RJ60CJ9064';
  GET DIAGNOSTICS rows_changed = ROW_COUNT; IF rows_changed <> 1 THEN RAISE EXCEPTION '1134 card rows %', rows_changed; END IF;
  UPDATE public.service_reception_entries SET reg_number = 'RJ60CK9064' WHERE id = 9980 AND reg_number = 'RJ60CJ9064';
  GET DIAGNOSTICS rows_changed = ROW_COUNT; IF rows_changed <> 1 THEN RAISE EXCEPTION '1134 reception rows %', rows_changed; END IF;
  UPDATE public.bodyshop_intake_vehicle_photos SET reg_number = 'RJ60CK9064' WHERE repair_card_id = 1134 AND reg_number = 'RJ60CJ9064';
  GET DIAGNOSTICS rows_changed = ROW_COUNT; IF rows_changed <> 1 THEN RAISE EXCEPTION '1134 photo rows %', rows_changed; END IF;

  -- 1253: 25BH5836Q -> 25BH5863Q (card 1219 may already use correct reg)
  IF (SELECT overall_status FROM public.bodyshop_repair_cards WHERE id = 1253) <> 'active'
     OR (SELECT reg_number FROM public.bodyshop_repair_cards WHERE id = 1253) <> '25BH5836Q'
     OR (SELECT job_card_no FROM public.bodyshop_repair_cards WHERE id = 1253) <> 'JC-MBTPLT-JP1-2627-008665'
     OR (SELECT reception_entry_id FROM public.bodyshop_repair_cards WHERE id = 1253) <> 11160 THEN
    RAISE EXCEPTION 'card 1253 is not in the audited state - stop';
  END IF;
  IF nullif(btrim((SELECT invoice_number FROM public.bodyshop_settlements WHERE repair_card_id = 1253)),'') IS NOT NULL THEN
    RAISE EXCEPTION 'card 1253 should have no invoice in audit - stop';
  END IF;
  IF (SELECT count(*) FROM public.bodyshop_settlement_lines WHERE repair_card_id = 1253 AND NOT is_reversed AND line_type <> 'reversal') <> 0
     OR (SELECT count(*) FROM public.bodyshop_intake_vehicle_photos WHERE repair_card_id = 1253) <> 8
     OR (SELECT count(*) FROM public.bodyshop_repair_card_documents WHERE repair_card_id = 1253) <> 11
     OR (SELECT count(*) FROM public.bodyshop_assignments WHERE repair_card_id = 1253) <> 0 THEN
    RAISE EXCEPTION 'card 1253 money/dependents differ from audit - stop';
  END IF;
  IF NOT exists (SELECT 1 FROM public.bodyshop_repair_cards WHERE id = 1219 AND overall_status <> 'cancelled'
                 AND regexp_replace(upper(reg_number),'[^A-Z0-9]','','g') = '25BH5863Q') THEN
    RAISE EXCEPTION 'expected live card 1219 on 25BH5863Q for audit - stop';
  END IF;
  UPDATE public.bodyshop_repair_cards SET reg_number = '25BH5863Q' WHERE id = 1253 AND reg_number = '25BH5836Q';
  GET DIAGNOSTICS rows_changed = ROW_COUNT; IF rows_changed <> 1 THEN RAISE EXCEPTION '1253 card rows %', rows_changed; END IF;
  UPDATE public.service_reception_entries SET reg_number = '25BH5863Q' WHERE id = 11160 AND reg_number = '25BH5836Q';
  GET DIAGNOSTICS rows_changed = ROW_COUNT; IF rows_changed <> 1 THEN RAISE EXCEPTION '1253 reception rows %', rows_changed; END IF;
  UPDATE public.bodyshop_intake_vehicle_photos SET reg_number = '25BH5863Q' WHERE repair_card_id = 1253 AND reg_number = '25BH5836Q';
  GET DIAGNOSTICS rows_changed = ROW_COUNT; IF rows_changed <> 8 THEN RAISE EXCEPTION '1253 photo rows %', rows_changed; END IF;

  SELECT count(*) INTO b2_typo FROM (
    WITH live AS (SELECT * FROM public.bodyshop_repair_cards WHERE overall_status <> 'cancelled'),
    dj AS (SELECT DISTINCT ON (upper(btrim(job_card_number))) upper(btrim(job_card_number)) jc,
                  regexp_replace(upper(coalesce(vehicle_registration_number,'')),'[^A-Z0-9]','','g') reg
           FROM public.psf_revenue_dms WHERE nullif(btrim(job_card_number),'') IS NOT NULL
           ORDER BY upper(btrim(job_card_number)), invoice_date DESC),
    di AS (SELECT DISTINCT ON (upper(btrim(invoice_number))) upper(btrim(invoice_number)) inv,
                  regexp_replace(upper(coalesce(vehicle_registration_number,'')),'[^A-Z0-9]','','g') reg
           FROM public.psf_revenue_dms WHERE nullif(btrim(invoice_number),'') IS NOT NULL
           ORDER BY upper(btrim(invoice_number)), invoice_date DESC),
    x AS (SELECT c.id, regexp_replace(upper(c.reg_number),'[^A-Z0-9]','','g') creg, dj.reg jreg, di.reg ireg
          FROM live c LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id
          LEFT JOIN dj ON dj.jc = upper(btrim(c.job_card_no)) LEFT JOIN di ON di.inv = upper(btrim(s.invoice_number))),
    f AS (SELECT x.*, (jreg IS NOT NULL AND jreg NOT IN ('','AF') AND jreg <> creg) jc_bad,
                 (ireg IS NOT NULL AND ireg NOT IN ('','AF') AND ireg <> creg) inv_bad FROM x),
    g AS (SELECT f.*, CASE WHEN jc_bad THEN jreg ELSE ireg END treg FROM f WHERE jc_bad OR inv_bad),
    h AS (SELECT g.*, (length(creg)=length(treg) AND (
            (SELECT count(*) FROM generate_series(1,length(creg)) i WHERE substr(creg,i,1)<>substr(treg,i,1)) = 1
            OR ((SELECT count(*) FROM generate_series(1,length(creg)) i WHERE substr(creg,i,1)<>substr(treg,i,1)) = 2
                AND (SELECT string_agg(ch,'' ORDER BY ch) FROM regexp_split_to_table(creg,'') ch)
                  = (SELECT string_agg(ch,'' ORDER BY ch) FROM regexp_split_to_table(treg,'') ch)))) typo FROM g)
    SELECT 1 FROM h WHERE typo
  ) q;

  report := format('751/1047/1134/1253 regs updated | live cards on 25BH5863Q = %s (expect 1219,1253) | B2 REG TYPO count = %s (expect 0)',
    (SELECT array_agg(id ORDER BY id) FROM public.bodyshop_repair_cards WHERE overall_status <> 'cancelled'
      AND regexp_replace(upper(reg_number),'[^A-Z0-9]','','g') = '25BH5863Q'), b2_typo);
  IF dry_run THEN
    RAISE EXCEPTION 'DRY RUN OK - nothing saved. REPORT: %', report;
  END IF;
  RAISE NOTICE 'SAVED. %', report;
END $$;