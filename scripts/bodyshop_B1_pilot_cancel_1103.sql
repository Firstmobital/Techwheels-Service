-- BATCH B1 PILOT (1 card): cancel duplicate card 1103. PREPARED 2026-11-17, NOT RUN. (v2: report shows in ONE place)
-- Case: invoice EMBTAI2627006922. Keep card 1052 (JC-MBTPLT-JP2-2627-006651, matches DMS, holds the Rs 63,120.02 DO).
--       Cancel card 1103 (job card field = registration RJ59CC5968, second reception entry 9767, no money, no photos).
-- Nothing is deleted. 'Cancel' is the same single update the app's "Cancel repair" button does
-- (bodyshop_repair_cards.overall_status = 'cancelled'), as already done for cards 474 and 1066.
-- 458 and 1031 are NOT in this pilot: they wait for the team's answers.
--
-- HOW TO USE (Supabase SQL Editor, run each BLOCK on its own: select the block text, then Run):
--   BLOCK 1  = VIEW. Shows the current state of both cards in ONE table. Run it before and again after.
--   BLOCK 2  = DRY RUN (dry_run = true). Does the cancel, builds the report, then raises an error on purpose so
--              NOTHING IS SAVED. The report appears in the red error message: "DRY RUN OK - nothing saved. ...".
--   BLOCK 2  again with dry_run := false = the real run. It saves the cancel and shows a success message.
--   Then run BLOCK 1 again: card 1103 shows 'cancelled', card 1052 shows 'active'.

-- ===== BLOCK 1: VIEW (read-only; run before and after) =====================================
SELECT c.id AS card, c.job_card_no, c.reg_number, c.overall_status AS status, c.current_stage AS stage,
       s.invoice_number, s.invoice_amount,
       (SELECT coalesce(sum(l.amount),0) FROM public.bodyshop_settlement_lines l WHERE l.repair_card_id = c.id AND l.line_type='do_component' AND NOT l.is_reversed) AS live_do,
       s.insurance_due_amount, s.outstanding_amount,
       (SELECT count(*) FROM public.bodyshop_repair_cards WHERE overall_status = 'cancelled') AS cancelled_cards_in_system
FROM public.bodyshop_repair_cards c JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id
WHERE c.id IN (1052, 1103) ORDER BY c.id;

-- ===== BLOCK 2: DRY RUN / REAL RUN (one atomic statement) ==================================
DO $$
DECLARE
  dry_run constant boolean := true;      -- <<< true = dry run (nothing saved). Change to false for the real run.
  r record; n int; rows_changed int;
  s1103 text; s1052 text; do1052 numeric; shared text; cancelled text; report text;
BEGIN
  -- GUARD: stop with an error if anything differs from what was audited.
  SELECT * INTO r FROM public.bodyshop_repair_cards WHERE id = 1103;
  IF NOT FOUND OR r.overall_status <> 'active' OR r.job_card_no <> 'RJ59CC5968' OR r.reg_number <> 'RJ59CC5968' OR r.reception_entry_id <> 9767 THEN
    RAISE EXCEPTION 'card 1103 is not in the audited state - stop';
  END IF;
  SELECT * INTO r FROM public.bodyshop_repair_cards WHERE id = 1052;
  IF NOT FOUND OR r.overall_status <> 'active' OR r.job_card_no <> 'JC-MBTPLT-JP2-2627-006651' THEN
    RAISE EXCEPTION 'keeper card 1052 is not in the audited state - stop';
  END IF;
  IF (SELECT invoice_number FROM public.bodyshop_settlements WHERE repair_card_id = 1052) IS DISTINCT FROM 'EMBTAI2627006922'
     OR (SELECT invoice_number FROM public.bodyshop_settlements WHERE repair_card_id = 1103) IS DISTINCT FROM 'EMBTAI2627006922' THEN
    RAISE EXCEPTION 'invoice no longer on both cards as audited - stop';
  END IF;
  -- 1103 must carry no money and no work records. The ONE allowed record is a survey-approval image
  -- (document id 8242, 8088.png, uploaded 15-Nov by the shared bodyshop login). Card 1052 already has its own
  -- survey approval (uploaded 7-Oct). The file stays in storage/Drive; it just stays linked to the cancelled card.
  IF (SELECT count(*) FROM public.bodyshop_repair_card_documents WHERE repair_card_id = 1103) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.bodyshop_repair_card_documents WHERE repair_card_id = 1103 AND id = 8242 AND doc_key = 'doc_survey_approval') THEN
    RAISE EXCEPTION 'documents on card 1103 are not exactly the audited one (id 8242) - stop';
  END IF;
  SELECT (SELECT count(*) FROM public.bodyshop_settlement_lines WHERE repair_card_id = 1103)
       + (SELECT count(*) FROM public.bodyshop_intake_vehicle_photos WHERE repair_card_id = 1103)
       + (SELECT count(*) FROM public.bodyshop_assignments WHERE repair_card_id = 1103)
       + (SELECT count(*) FROM public.bodyshop_floor_daily_updates WHERE repair_card_id = 1103)
       + (SELECT count(*) FROM public.bodyshop_floor_role_daily_logs WHERE repair_card_id = 1103)
       + (SELECT count(*) FROM public.bodyshop_floor_worker_role_qc WHERE repair_card_id = 1103)
  INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'card 1103 now has % dependent rows (money/photos/work) - stop', n; END IF;
  IF (SELECT count(*) FROM public.bodyshop_settlement_lines WHERE repair_card_id = 1052 AND NOT is_reversed AND line_type = 'do_component') <> 2 THEN
    RAISE EXCEPTION 'card 1052 DO lines changed - stop';
  END IF;

  -- THE CHANGE (one row)
  UPDATE public.bodyshop_repair_cards SET overall_status = 'cancelled' WHERE id = 1103 AND overall_status = 'active';
  GET DIAGNOSTICS rows_changed = ROW_COUNT;
  IF rows_changed <> 1 THEN RAISE EXCEPTION 'expected to change exactly 1 card, changed % - stop', rows_changed; END IF;

  -- REPORT (read after the change, inside the same statement)
  SELECT overall_status INTO s1103 FROM public.bodyshop_repair_cards WHERE id = 1103;
  SELECT overall_status INTO s1052 FROM public.bodyshop_repair_cards WHERE id = 1052;
  SELECT coalesce(sum(amount),0) INTO do1052 FROM public.bodyshop_settlement_lines WHERE repair_card_id = 1052 AND line_type = 'do_component' AND NOT is_reversed;
  SELECT coalesce(string_agg(inv || ' on cards ' || cards, ' ; '), 'none') INTO shared FROM (
    SELECT upper(btrim(s.invoice_number)) inv, string_agg(s.repair_card_id::text, '/' ORDER BY s.repair_card_id) cards
    FROM public.bodyshop_settlements s JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
    WHERE c.overall_status <> 'cancelled' AND nullif(btrim(s.invoice_number),'') IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x;
  SELECT string_agg(id::text, ', ' ORDER BY id) INTO cancelled FROM public.bodyshop_repair_cards WHERE overall_status = 'cancelled';
  report := format('cards changed = %s (expect 1) | card 1103 = %s (expect cancelled) | card 1052 = %s (expect active) | card 1052 live DO = %s (expect 63120.02) | '
                   || 'cancelled cards = [%s] (expect 474, 1066, 1103) | invoices still shared among live cards = %s (expect EMBTAI2627006922 gone, 3 left: IMBTAI2627004773 on 441/458 ; IMBTAI2627009463 on 1031/1293 ; IMBTAI2627009714 on 1302/1310)',
                   rows_changed, s1103, s1052, do1052, cancelled, shared);

  IF dry_run THEN
    RAISE EXCEPTION 'DRY RUN OK - nothing saved. REPORT: %', report;   -- this error is the dry-run result, it undoes the cancel
  END IF;
  RAISE NOTICE 'SAVED. %', report;
END $$;
