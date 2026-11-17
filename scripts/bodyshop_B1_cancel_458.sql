-- BATCH B1: cancel wrong card 458 (job card JC-MBTPLT-JP1-2626-004108, typo year 2626). 2026-11-17.
-- Invoice IMBTAI2627004773. Keep card 441 (JC-MBTPLT-JP1-2627-004108, matches DMS).
-- Preconditions confirmed by the owner: the Rs 13,085 customer receipt on 458 and the Rs 13,085 DO on 441 were both REVERSED
-- on 17-Nov (lines 1325, 1326). The correct payment entry will be made later by Accounts, on card 441.
-- 'Cancel' = bodyshop_repair_cards.overall_status = 'cancelled' (same as the app's Cancel repair). Nothing is deleted:
-- 458 keeps its 14 photos, 7 documents, 2 assignments, history and settlement lines (lines are append-only anyway).
-- dry_run = true raises an error on purpose and saves nothing; set to false for the real run.
DO $$
DECLARE
  dry_run constant boolean := true;
  r record; n int; rows_changed int; live441 int; live458 int; s458 text; s441 text; shared text; cancelled text; report text;
BEGIN
  SELECT * INTO r FROM public.bodyshop_repair_cards WHERE id = 458;
  IF NOT FOUND OR r.overall_status <> 'active' OR r.job_card_no <> 'JC-MBTPLT-JP1-2626-004108' OR r.reception_entry_id <> 3780 THEN
    RAISE EXCEPTION 'card 458 is not in the audited state - stop';
  END IF;
  SELECT * INTO r FROM public.bodyshop_repair_cards WHERE id = 441;
  IF NOT FOUND OR r.overall_status <> 'active' OR r.job_card_no <> 'JC-MBTPLT-JP1-2627-004108' THEN
    RAISE EXCEPTION 'keeper card 441 is not in the audited state - stop';
  END IF;
  IF (SELECT invoice_number FROM public.bodyshop_settlements WHERE repair_card_id = 458) IS DISTINCT FROM 'IMBTAI2627004773'
     OR (SELECT invoice_number FROM public.bodyshop_settlements WHERE repair_card_id = 441) IS DISTINCT FROM 'IMBTAI2627004773' THEN
    RAISE EXCEPTION 'invoice no longer on both cards as audited - stop';
  END IF;
  -- no live money on either card (everything reversed)
  SELECT count(*) INTO live458 FROM public.bodyshop_settlement_lines WHERE repair_card_id = 458 AND NOT is_reversed AND line_type <> 'reversal';
  SELECT count(*) INTO live441 FROM public.bodyshop_settlement_lines WHERE repair_card_id = 441 AND NOT is_reversed AND line_type <> 'reversal';
  IF live458 <> 0 OR live441 <> 0 THEN
    RAISE EXCEPTION 'live money lines exist (458: %, 441: %) - reverse them first - stop', live458, live441;
  END IF;
  -- audited dependents of 458 (they stay, linked to the cancelled card)
  IF (SELECT count(*) FROM public.bodyshop_intake_vehicle_photos WHERE repair_card_id = 458) <> 14
     OR (SELECT count(*) FROM public.bodyshop_repair_card_documents WHERE repair_card_id = 458) <> 7
     OR (SELECT count(*) FROM public.bodyshop_assignments WHERE repair_card_id = 458) <> 2
     OR (SELECT count(*) FROM public.bodyshop_floor_daily_updates WHERE repair_card_id = 458) <> 0 THEN
    RAISE EXCEPTION 'dependents of card 458 differ from the audit - stop';
  END IF;

  UPDATE public.bodyshop_repair_cards SET overall_status = 'cancelled' WHERE id = 458 AND overall_status = 'active';
  GET DIAGNOSTICS rows_changed = ROW_COUNT;
  IF rows_changed <> 1 THEN RAISE EXCEPTION 'expected to change exactly 1 card, changed % - stop', rows_changed; END IF;

  SELECT overall_status INTO s458 FROM public.bodyshop_repair_cards WHERE id = 458;
  SELECT overall_status INTO s441 FROM public.bodyshop_repair_cards WHERE id = 441;
  SELECT coalesce(string_agg(inv || ' on cards ' || cards, ' ; '), 'none') INTO shared FROM (
    SELECT upper(btrim(s.invoice_number)) inv, string_agg(s.repair_card_id::text, '/' ORDER BY s.repair_card_id) cards
    FROM public.bodyshop_settlements s JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
    WHERE c.overall_status <> 'cancelled' AND nullif(btrim(s.invoice_number),'') IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x;
  SELECT string_agg(id::text, ', ' ORDER BY id) INTO cancelled FROM public.bodyshop_repair_cards WHERE overall_status = 'cancelled';
  report := format('cards changed = %s (expect 1) | card 458 = %s (expect cancelled) | card 441 = %s (expect active) | live money 458/441 = %s/%s (expect 0/0) | '
                   || 'cancelled cards = [%s] (expect 458, 474, 1066, 1103) | invoices still shared among live cards = %s (expect only IMBTAI2627009463 on 1031/1293 ; IMBTAI2627009714 on 1302/1310)',
                   rows_changed, s458, s441, live458, live441, cancelled, shared);
  IF dry_run THEN
    RAISE EXCEPTION 'DRY RUN OK - nothing saved. REPORT: %', report;
  END IF;
  RAISE NOTICE 'SAVED. %', report;
END $$;
