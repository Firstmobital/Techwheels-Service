-- BATCH B1: cancel duplicate card 1310 (RJ45CM1841, placeholder job card, second reception entry 11815). 2026-11-17.
-- Invoice IMBTAI2627009714. Keep card 1302 (JC-MBTPLT-JP1-2627-009050, matches DMS, the real card with the floor work).
-- Precondition done by the owner: receipt line 1068 (Rs 1,670, UPI ref T2611021837059655807957, voucher JApp/26-27/1880) was REVERSED on 17-Nov
-- (admin, 3:47 pm). The single Rs 1,670 receipt now lives on 1302 (line 1080, ref 400714, voucher JApp/26-27/1966).
-- 'Cancel' = overall_status = 'cancelled' (same as the app's Cancel repair). Nothing is deleted; 1310 keeps 1 photo and 2 documents.
-- Still to do by hand: re-upload "1841 TAX INVOICE.PDF" (only on 1310) to card 1302; Accounts cancel voucher JApp/26-27/1880 in the books.
-- dry_run = true raises an error on purpose and saves nothing; set to false for the real run.
DO $$
DECLARE
  dry_run constant boolean := true;
  r record; n int; rows_changed int; live1310 int; live1302 numeric; s1310 text; s1302 text; shared text; cancelled text; report text;
BEGIN
  SELECT * INTO r FROM public.bodyshop_repair_cards WHERE id = 1310;
  IF NOT FOUND OR r.overall_status <> 'active' OR r.job_card_no <> 'RJ45CM1841' OR r.reception_entry_id <> 11815 THEN
    RAISE EXCEPTION 'card 1310 is not in the audited state - stop';
  END IF;
  SELECT * INTO r FROM public.bodyshop_repair_cards WHERE id = 1302;
  IF NOT FOUND OR r.overall_status <> 'active' OR r.job_card_no <> 'JC-MBTPLT-JP1-2627-009050' THEN
    RAISE EXCEPTION 'keeper card 1302 is not in the audited state - stop';
  END IF;
  IF (SELECT invoice_number FROM public.bodyshop_settlements WHERE repair_card_id = 1310) IS DISTINCT FROM 'IMBTAI2627009714'
     OR (SELECT invoice_number FROM public.bodyshop_settlements WHERE repair_card_id = 1302) IS DISTINCT FROM 'IMBTAI2627009714' THEN
    RAISE EXCEPTION 'invoice no longer on both cards as audited - stop';
  END IF;
  -- 1310 must hold no live money (its receipt was reversed)
  SELECT count(*) INTO live1310 FROM public.bodyshop_settlement_lines WHERE repair_card_id = 1310 AND NOT is_reversed AND line_type <> 'reversal';
  IF live1310 <> 0 THEN RAISE EXCEPTION 'card 1310 still has % live money lines - reverse them first - stop', live1310; END IF;
  -- 1302 must still hold exactly the one audited Rs 1,670 receipt
  SELECT coalesce(sum(amount),0) INTO live1302 FROM public.bodyshop_settlement_lines WHERE repair_card_id = 1302 AND NOT is_reversed AND line_type = 'receipt';
  IF live1302 <> 1670.00 OR (SELECT count(*) FROM public.bodyshop_settlement_lines WHERE repair_card_id = 1302 AND NOT is_reversed AND line_type <> 'reversal') <> 1 THEN
    RAISE EXCEPTION 'card 1302 live money is not the single audited Rs 1,670 receipt (found %) - stop', live1302;
  END IF;
  -- audited dependents of 1310 (they stay linked to the cancelled card)
  SELECT (SELECT count(*) FROM public.bodyshop_assignments WHERE repair_card_id = 1310)
       + (SELECT count(*) FROM public.bodyshop_floor_daily_updates WHERE repair_card_id = 1310)
       + (SELECT count(*) FROM public.bodyshop_floor_role_daily_logs WHERE repair_card_id = 1310)
       + (SELECT count(*) FROM public.bodyshop_floor_worker_role_qc WHERE repair_card_id = 1310) INTO n;
  IF n <> 0 OR (SELECT count(*) FROM public.bodyshop_intake_vehicle_photos WHERE repair_card_id = 1310) <> 1
     OR (SELECT count(*) FROM public.bodyshop_repair_card_documents WHERE repair_card_id = 1310) <> 2 THEN
    RAISE EXCEPTION 'dependents of card 1310 differ from the audit - stop';
  END IF;

  UPDATE public.bodyshop_repair_cards SET overall_status = 'cancelled' WHERE id = 1310 AND overall_status = 'active';
  GET DIAGNOSTICS rows_changed = ROW_COUNT;
  IF rows_changed <> 1 THEN RAISE EXCEPTION 'expected to change exactly 1 card, changed % - stop', rows_changed; END IF;

  SELECT overall_status INTO s1310 FROM public.bodyshop_repair_cards WHERE id = 1310;
  SELECT overall_status INTO s1302 FROM public.bodyshop_repair_cards WHERE id = 1302;
  SELECT coalesce(string_agg(inv || ' on cards ' || cards, ' ; '), 'none') INTO shared FROM (
    SELECT upper(btrim(s.invoice_number)) inv, string_agg(s.repair_card_id::text, '/' ORDER BY s.repair_card_id) cards
    FROM public.bodyshop_settlements s JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
    WHERE c.overall_status <> 'cancelled' AND nullif(btrim(s.invoice_number),'') IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x;
  SELECT string_agg(id::text, ', ' ORDER BY id) INTO cancelled FROM public.bodyshop_repair_cards WHERE overall_status = 'cancelled';
  report := format('cards changed = %s (expect 1) | card 1310 = %s (expect cancelled) | card 1302 = %s (expect active) | live money 1310/1302 = %s/%s (expect 0/1670) | '
                   || 'cancelled cards = [%s] (expect 458, 474, 1016, 1066, 1103, 1310) | invoices still shared among live cards = %s (expect none)',
                   rows_changed, s1310, s1302, live1310, live1302, cancelled, shared);
  IF dry_run THEN
    RAISE EXCEPTION 'DRY RUN OK - nothing saved. REPORT: %', report;
  END IF;
  RAISE NOTICE 'SAVED. %', report;
END $$;
