-- BODYSHOP duplicate / wrong-invoice CLEANUP  (prepared 2026-11-17, NOT RUN)
-- Run in the Supabase SQL Editor. Runs inside one transaction and ENDS WITH ROLLBACK,
-- so the first run is a dry run: read the three result tables, then change ROLLBACK to COMMIT and run again.
-- Settlement lines are append-only, so money is undone by a 'reversal' line (same as reverse_bodyshop_settlement_line),
-- never by deleting. Cards are cancelled (overall_status='cancelled'), same as the app's Cancel repair. Nothing is hard-deleted.
-- Each card is guarded: if its state no longer matches what was audited, the script raises and nothing changes.

BEGIN;

-- helper: reverse one live line exactly like the RPC does (actor left null: SQL editor has no app user)
CREATE OR REPLACE FUNCTION pg_temp.rev_line(p_line bigint, p_reason text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v public.bodyshop_settlement_lines%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.bodyshop_settlement_lines WHERE id = p_line;
  IF NOT FOUND OR v.is_reversed OR v.line_type = 'reversal' THEN
    RAISE EXCEPTION 'line % missing or already reversed - audit state changed, stop', p_line;
  END IF;
  INSERT INTO public.bodyshop_settlement_lines
    (settlement_id, repair_card_id, party, line_type, component, amount, txn_date, reference, remarks, reverses_line_id)
  VALUES (v.settlement_id, v.repair_card_id, v.party, 'reversal', v.component, v.amount, CURRENT_DATE, v.reference, p_reason, p_line);
  PERFORM public._bodyshop_settlement_mark_line_reversed(p_line);
  PERFORM public.recalc_bodyshop_settlement(v.settlement_id);
END $$;

-- helper: cancel a card only if it is still active and (optionally) has no live money lines
CREATE OR REPLACE FUNCTION pg_temp.cancel_card(p_card bigint, p_expect_jc text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM public.bodyshop_settlement_lines WHERE repair_card_id = p_card AND NOT is_reversed AND line_type <> 'reversal') > 0 THEN
    RAISE EXCEPTION 'card % still has live money lines - reverse them first', p_card;
  END IF;
  UPDATE public.bodyshop_repair_cards SET overall_status = 'cancelled'
   WHERE id = p_card AND overall_status = 'active' AND job_card_no = p_expect_jc;
  IF NOT FOUND THEN RAISE EXCEPTION 'card % not active or job card <> %', p_card, p_expect_jc; END IF;
END $$;

-- ===== A. Wrong-vehicle links (certain) ====================================================
-- A1. Card 461 (RJ45CK9236, JC ...004107, inv IMBTAI2627004371): DMS ties that JC+invoice to RJ18CJ2222 / MEENA.
--     Card 439 is the real RJ45CK9236 card (inv ...004858). Undo the Rs 4,300 DO line, then cancel.
SELECT pg_temp.rev_line(626, 'Wrong vehicle: JC/invoice belong to RJ18CJ2222 per DMS; duplicate card 461 cancelled 2026-11-17');
SELECT pg_temp.cancel_card(461, 'JC-MBTPLT-JP1-2627-004107');

-- A2. Card 1220 (KAMAL SHARMA, RJ45CX5427, JC ...007653) is a REAL vehicle still in progress (stage 9),
--     but it was given invoice EMBTAI2627006576, which DMS says is RJ21CD5427 = card 1024. Keep the card,
--     remove the wrong invoice and the Rs 17,474 DO line. Re-enter the correct invoice/DO when DMS has it.
SELECT pg_temp.rev_line(1011, 'Wrong vehicle: invoice EMBTAI2627006576 belongs to RJ21CD5427 (card 1024)');
UPDATE public.bodyshop_settlements
   SET invoice_number = NULL, invoice_date = NULL, invoice_amount = NULL, invoice_source = NULL,
       invoice_dms_amount_at_save = NULL, do_amount = NULL, needs_accounts_review = true
 WHERE repair_card_id = 1220 AND invoice_number = 'EMBTAI2627006576';
SELECT public.recalc_bodyshop_settlement(id) FROM public.bodyshop_settlements WHERE repair_card_id = 1220;

-- ===== B. Same invoice on two cards: keep the card whose JC matches DMS, cancel the other ==
-- B1. IMBTAI2627004773: DMS JC ...2627-004108 -> keep 441; cancel 458 (JC typo ...2626-004108, no money).
SELECT pg_temp.cancel_card(458, 'JC-MBTPLT-JP1-2626-004108');
-- B2. EMBTAI2627006922: DMS JC ...006651 -> keep 1052 (has the Rs 63,120 DO); cancel 1103 (placeholder JC, no money).
SELECT pg_temp.cancel_card(1103, 'RJ59CC5968');
-- B3. IMBTAI2627009463: DMS JC ...009095 -> keep 1293 (Oct, has Rs 6,000 receipts); cancel 1031 (Sept placeholder, no money, no real JC).
SELECT pg_temp.cancel_card(1031, 'RJ60CH4302');

-- ===== C. NEEDS YOUR / ACCOUNTS DECISION - left OFF ========================================
-- C1. IMBTAI2627009714: DMS JC ...009050 -> keep 1302, cancel 1310. BUT both carry a Rs 1,670 customer receipt
--     (1302: ref 400714 / JApp/26-27/1966 ; 1310: ref T2611021837... / JApp/26-27/1880), same date 2-Nov.
--     If the customer paid ONCE, one of them is a double count. Accounts must check the bank/UPI statement, then
--     reverse the one that is not real and run cancel on 1310. Uncomment the pair you want:
-- SELECT pg_temp.rev_line(1068, 'Duplicate receipt: card 1310 is a duplicate of 1302');   -- 1310's receipt is the duplicate
-- SELECT pg_temp.rev_line(1080, 'Duplicate receipt: same payment already on card 1310');  -- 1302's receipt is the duplicate (then 1310 keeps its line, so do NOT cancel 1310 until moved)
-- SELECT pg_temp.cancel_card(1310, 'RJ45CM1841');   -- only after 1310 has no live lines

-- C2. Same-registration placeholder cards (JC field = registration, stage 1, no history/money/photos):
--     RJ49CB1632: 1392 (16-Nov) vs 1400 (17-Nov)      RJ60CK8118: 1389 (16-Nov) vs 1399 (17-Nov)
--     Cancel the later one ONLY if it is really a double reception, not a new visit:
-- SELECT pg_temp.cancel_card(1400, 'RJ49CB1632');
-- SELECT pg_temp.cancel_card(1399, 'RJ60CK8118');

-- ===== Result checks (read these before changing ROLLBACK to COMMIT) =======================
-- R1. cards touched
SELECT c.id, c.job_card_no, c.reg_number, c.overall_status, s.invoice_number, s.invoice_amount,
       (SELECT coalesce(sum(l.amount),0) FROM public.bodyshop_settlement_lines l
         WHERE l.repair_card_id = c.id AND NOT l.is_reversed AND l.line_type <> 'reversal' AND l.line_type IN ('receipt')) AS live_receipts,
       (SELECT coalesce(sum(l.amount),0) FROM public.bodyshop_settlement_lines l
         WHERE l.repair_card_id = c.id AND NOT l.is_reversed AND l.line_type = 'do_component') AS live_do
FROM public.bodyshop_repair_cards c LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id = c.id
WHERE c.id IN (461,439,1220,1024,458,441,1103,1052,1031,1293,1302,1310) ORDER BY c.id;
-- R2. remaining shared invoices among NON-cancelled cards (expect only EMBTAI.../IMBTAI2627009714 if C1 still off)
SELECT upper(btrim(s.invoice_number)) inv, count(*), array_agg(s.repair_card_id)
FROM public.bodyshop_settlements s JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
WHERE c.overall_status <> 'cancelled' AND nullif(btrim(s.invoice_number),'') IS NOT NULL
GROUP BY 1 HAVING count(*) > 1;
-- R3. remaining shared REAL job card numbers among non-cancelled cards (placeholders = registration excluded)
SELECT upper(btrim(job_card_no)) jc, count(*), array_agg(id)
FROM public.bodyshop_repair_cards
WHERE overall_status <> 'cancelled' AND upper(btrim(job_card_no)) <> upper(btrim(reg_number))
GROUP BY 1 HAVING count(*) > 1;

ROLLBACK;   -- <- change to COMMIT only after the checks look right
