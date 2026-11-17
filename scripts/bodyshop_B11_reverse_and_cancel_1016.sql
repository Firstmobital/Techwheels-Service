-- BATCH B11 / B1: card 1016 (RJ60CH4302) is a MECHANICAL "Second Free Service" visit wrongly created as a bodyshop card.
-- Owner instruction 17-Nov-2026: reverse its payment entry, then cancel the card.
--   1) reverse receipt line 931 (Rs 14,308, ref T2609211707328355897973, voucher JApp/26-27/1522) with a 'reversal' line
--      (same effect as reverse_bodyshop_settlement_line; settlement lines are append-only, nothing is deleted)
--   2) set card 1016 overall_status = 'cancelled' (same as the app's Cancel repair)
-- NOT done here: mechanical accounts row 704 (billed Rs 3,179.50, received Rs 14,308) is Accounts' to fix on the mechanical screen.
-- NOT done here: Rs 11,129 must later be posted on card 1031 (accident visit, invoice IMBTAI2627007779) by Accounts.
-- Voucher JApp/26-27/1522 stays in the books; Accounts must re-use or cancel it when they re-post.
-- dry_run = true raises an error on purpose and saves nothing; set to false for the real run.
DO $$
DECLARE
  dry_run constant boolean := true;
  v public.bodyshop_settlement_lines%ROWTYPE;
  r record; n int; rows_changed int;
  live_after int; recv_after numeric; s1016 text; shared text; cancelled text; report text; rev_id bigint;
BEGIN
  -- GUARD: card
  SELECT * INTO r FROM public.bodyshop_repair_cards WHERE id = 1016;
  IF NOT FOUND OR r.overall_status <> 'active' OR r.job_card_no <> 'RJ60CH4302' OR r.reception_entry_id <> 9025 THEN
    RAISE EXCEPTION 'card 1016 is not in the audited state - stop';
  END IF;
  IF (SELECT service_type FROM public.service_reception_entries WHERE id = 9025) IS DISTINCT FROM 'Second Free Service' THEN
    RAISE EXCEPTION 'reception 9025 is no longer a Second Free Service - stop';
  END IF;
  -- GUARD: the one live money line must be exactly the audited receipt
  SELECT * INTO v FROM public.bodyshop_settlement_lines WHERE id = 931;
  IF NOT FOUND OR v.repair_card_id <> 1016 OR v.line_type <> 'receipt' OR v.amount <> 14308.00 OR v.is_reversed
     OR v.reference IS DISTINCT FROM 'T2609211707328355897973' THEN
    RAISE EXCEPTION 'line 931 is not the audited live receipt on card 1016 - stop';
  END IF;
  IF (SELECT count(*) FROM public.bodyshop_settlement_lines WHERE repair_card_id = 1016 AND NOT is_reversed AND line_type <> 'reversal') <> 1 THEN
    RAISE EXCEPTION 'card 1016 has other live money lines than the audited one - stop';
  END IF;
  -- GUARD: no work records except the one audited survey-approval document
  SELECT (SELECT count(*) FROM public.bodyshop_intake_vehicle_photos WHERE repair_card_id = 1016)
       + (SELECT count(*) FROM public.bodyshop_assignments WHERE repair_card_id = 1016)
       + (SELECT count(*) FROM public.bodyshop_floor_daily_updates WHERE repair_card_id = 1016)
       + (SELECT count(*) FROM public.bodyshop_floor_role_daily_logs WHERE repair_card_id = 1016)
       + (SELECT count(*) FROM public.bodyshop_floor_worker_role_qc WHERE repair_card_id = 1016)
  INTO n;
  IF n <> 0 OR (SELECT count(*) FROM public.bodyshop_repair_card_documents WHERE repair_card_id = 1016) <> 1 THEN
    RAISE EXCEPTION 'card 1016 dependents differ from the audit - stop';
  END IF;

  -- STEP 1: reverse the receipt (append a reversal line, mark the original reversed, recalc the settlement)
  INSERT INTO public.bodyshop_settlement_lines
    (settlement_id, repair_card_id, party, line_type, component, amount, txn_date, reference, remarks, reverses_line_id)
  VALUES (v.settlement_id, v.repair_card_id, v.party, 'reversal', v.component, v.amount, CURRENT_DATE, v.reference,
          'Reversed 17-Nov-2026 on owner instruction: card 1016 is a mechanical Second Free Service visit; payment to be re-posted by Accounts (Rs 3,179.50 mechanical, Rs 11,129 on bodyshop card 1031)', 931)
  RETURNING id INTO rev_id;
  PERFORM public._bodyshop_settlement_mark_line_reversed(931);
  PERFORM public.recalc_bodyshop_settlement(v.settlement_id);

  -- STEP 2: cancel the card
  UPDATE public.bodyshop_repair_cards SET overall_status = 'cancelled' WHERE id = 1016 AND overall_status = 'active';
  GET DIAGNOSTICS rows_changed = ROW_COUNT;
  IF rows_changed <> 1 THEN RAISE EXCEPTION 'expected to cancel exactly 1 card, changed % - stop', rows_changed; END IF;

  -- REPORT
  SELECT count(*) INTO live_after FROM public.bodyshop_settlement_lines WHERE repair_card_id = 1016 AND NOT is_reversed AND line_type <> 'reversal';
  SELECT coalesce(sum(amount),0) INTO recv_after FROM public.bodyshop_settlement_lines WHERE repair_card_id = 1016 AND line_type = 'receipt' AND NOT is_reversed;
  SELECT overall_status INTO s1016 FROM public.bodyshop_repair_cards WHERE id = 1016;
  SELECT coalesce(string_agg(inv || ' on cards ' || cards, ' ; '), 'none') INTO shared FROM (
    SELECT upper(btrim(s.invoice_number)) inv, string_agg(s.repair_card_id::text, '/' ORDER BY s.repair_card_id) cards
    FROM public.bodyshop_settlements s JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
    WHERE c.overall_status <> 'cancelled' AND nullif(btrim(s.invoice_number),'') IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x;
  SELECT string_agg(id::text, ', ' ORDER BY id) INTO cancelled FROM public.bodyshop_repair_cards WHERE overall_status = 'cancelled';
  report := format('reversal line id = %s (new) | card 1016 = %s (expect cancelled) | live money lines on 1016 = %s (expect 0) | live receipts on 1016 = %s (expect 0) | '
                   || 'original line 931 reversed = %s (expect true) | cancelled cards = [%s] (expect 458, 474, 1016, 1066, 1103) | invoices still shared among live cards = %s (expect only IMBTAI2627009463 on 1031/1293 ; IMBTAI2627009714 on 1302/1310)',
                   rev_id, s1016, live_after, recv_after, (SELECT is_reversed FROM public.bodyshop_settlement_lines WHERE id = 931), cancelled, shared);
  IF dry_run THEN
    RAISE EXCEPTION 'DRY RUN OK - nothing saved. REPORT: %', report;
  END IF;
  RAISE NOTICE 'SAVED. %', report;
END $$;
