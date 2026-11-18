-- BATCH B4 (REG TYPO): correct registration on card 536 to match DMS (owner validated 18-Nov-2026).
-- EXECUTED 18-Nov-2026: dry_run true -> DRY RUN OK (reg RJ60CE9139, B2 REG TYPO count 4); dry_run false -> SAVED (same report).
-- Card RJ60CF9139 -> RJ60CE9139. Job card + invoice IMBTAI2627005055 already match DMS for CE reg; only reg typo on card/reception/photos.
-- Does not touch money (live DO Rs 19,659.24 on lines 399+400).
-- dry_run = true raises on purpose and saves nothing; set to false for the real run.
DO $$
DECLARE
  dry_run constant boolean := true; -- real run done 18-Nov-2026 (see plan tracker B4)
  r record; rows_changed int; n int;
  live_do numeric; live_rcpt numeric; live_n int;
  new_reg constant text := 'RJ60CE9139';
  old_reg constant text := 'RJ60CF9139';
  report text; b2_typo int;
BEGIN
  SELECT * INTO r FROM public.bodyshop_repair_cards WHERE id = 536;
  IF NOT FOUND OR r.overall_status <> 'active' OR r.reg_number <> old_reg
     OR r.job_card_no <> 'JC-MBTPLT-JP1-2627-004458' OR r.reception_entry_id <> 4134 THEN
    RAISE EXCEPTION 'card 536 is not in the audited state - stop';
  END IF;
  IF (SELECT reg_number FROM public.service_reception_entries WHERE id = 4134) IS DISTINCT FROM old_reg THEN
    RAISE EXCEPTION 'reception 4134 reg is not the audited % - stop', old_reg;
  END IF;
  IF (SELECT invoice_number FROM public.bodyshop_settlements WHERE repair_card_id = 536) IS DISTINCT FROM 'IMBTAI2627005055'
     OR (SELECT invoice_amount FROM public.bodyshop_settlements WHERE repair_card_id = 536) IS DISTINCT FROM 21670.00 THEN
    RAISE EXCEPTION 'invoice on 536 is not the audited IMBTAI2627005055 / 21670 - stop';
  END IF;
  SELECT count(*), coalesce(sum(amount) FILTER (WHERE line_type='do_component'),0),
         coalesce(sum(amount) FILTER (WHERE line_type='receipt'),0)
  INTO live_n, live_do, live_rcpt
  FROM public.bodyshop_settlement_lines WHERE repair_card_id = 536 AND NOT is_reversed AND line_type <> 'reversal';
  IF live_n <> 2 OR live_do <> 19659.24 OR live_rcpt <> 0 THEN
    RAISE EXCEPTION 'card 536 live money not audited (lines=%, do=%, rcpt=%) - stop', live_n, live_do, live_rcpt;
  END IF;
  IF (SELECT count(*) FROM public.bodyshop_intake_vehicle_photos WHERE repair_card_id = 536) <> 4
     OR exists (SELECT 1 FROM public.bodyshop_intake_vehicle_photos WHERE repair_card_id = 536 AND reg_number <> old_reg)
     OR (SELECT count(*) FROM public.bodyshop_repair_card_documents WHERE repair_card_id = 536) <> 8
     OR (SELECT count(*) FROM public.bodyshop_assignments WHERE repair_card_id = 536) <> 1 THEN
    RAISE EXCEPTION 'card 536 dependents differ from audit - stop';
  END IF;
  IF exists (
    SELECT 1 FROM public.bodyshop_repair_cards o
    WHERE o.overall_status <> 'cancelled' AND o.id <> 536
      AND regexp_replace(upper(o.reg_number),'[^A-Z0-9]','','g') = regexp_replace(upper(new_reg),'[^A-Z0-9]','','g')
  ) THEN
    RAISE EXCEPTION 'another live card already has reg % - stop', new_reg;
  END IF;

  UPDATE public.bodyshop_repair_cards SET reg_number = new_reg WHERE id = 536 AND reg_number = old_reg;
  GET DIAGNOSTICS rows_changed = ROW_COUNT;
  IF rows_changed <> 1 THEN RAISE EXCEPTION 'expected 1 card row, changed % - stop', rows_changed; END IF;

  UPDATE public.service_reception_entries SET reg_number = new_reg WHERE id = 4134 AND reg_number = old_reg;
  GET DIAGNOSTICS rows_changed = ROW_COUNT;
  IF rows_changed <> 1 THEN RAISE EXCEPTION 'expected 1 reception row, changed % - stop', rows_changed; END IF;

  UPDATE public.bodyshop_intake_vehicle_photos SET reg_number = new_reg
  WHERE repair_card_id = 536 AND reg_number = old_reg;
  GET DIAGNOSTICS rows_changed = ROW_COUNT;
  IF rows_changed <> 4 THEN RAISE EXCEPTION 'expected 4 photo rows, changed % - stop', rows_changed; END IF;

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

  SELECT reg_number INTO r.reg_number FROM public.bodyshop_repair_cards WHERE id = 536;
  report := format('card 536 reg = %s (expect %s) | reception 4134 = %s | B2 REG TYPO live count = %s (expect 4 after pilot)',
                   r.reg_number, new_reg,
                   (SELECT reg_number FROM public.service_reception_entries WHERE id = 4134), b2_typo);
  IF dry_run THEN
    RAISE EXCEPTION 'DRY RUN OK - nothing saved. REPORT: %', report;
  END IF;
  RAISE NOTICE 'SAVED. %', report;
END $$;