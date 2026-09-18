-- Practical verification for bulk payment import idempotency.
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
-- Unique index predicate excludes reversed lines and NULL tokens.
-- Inserts, if any, are rolled back.

-- Unique index predicate excludes reversed lines and NULL tokens
SELECT
  pg_get_expr(ix.indpred, ix.indrelid) LIKE '%import_row_token IS NOT NULL%'
  AND pg_get_expr(ix.indpred, ix.indrelid) LIKE '%is_reversed = false%'
    AS unique_index_excludes_manual_and_reversed
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'bodyshop_settlement_lines'
  AND i.relname = 'uq_bodyshop_settlement_lines_import_row_token_component';

-- Recalc still clamps insurance due (unchanged by this migration)
SELECT
  pg_get_functiondef(p.oid) LIKE '%GREATEST%'
  AND pg_get_functiondef(p.oid) LIKE '%insurance_due_amount%'
    AS due_still_clamped_at_zero
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'recalc_bodyshop_settlement';

-- Insert-level idempotency: same token+component is rejected; CP after DO is allowed;
-- a second CP with the same token is rejected. Rolled back.
BEGIN;

DO $$
DECLARE
  v_s public.bodyshop_settlements%ROWTYPE;
  v_token text := 'brp-practical-20260918-idempotency';
  v_dup boolean := false;
  v_cp_dup boolean := false;
BEGIN
  SELECT * INTO v_s FROM public.bodyshop_settlements ORDER BY id LIMIT 1;
  IF NOT FOUND THEN
    RAISE NOTICE 'no settlement header; skipping insert-level idempotency probe';
    RETURN;
  END IF;

  INSERT INTO public.bodyshop_settlement_lines (
    settlement_id, repair_card_id, party, line_type, component, amount,
    txn_date, reference, remarks, import_row_token
  ) VALUES (
    v_s.id, v_s.repair_card_id, 'insurance', 'do_component', 'MAIN', 1.00,
    CURRENT_DATE, v_token, 'practical unique index MAIN', v_token
  );

  BEGIN
    INSERT INTO public.bodyshop_settlement_lines (
      settlement_id, repair_card_id, party, line_type, component, amount,
      txn_date, reference, remarks, import_row_token
    ) VALUES (
      v_s.id, v_s.repair_card_id, 'insurance', 'do_component', 'MAIN', 1.00,
      CURRENT_DATE, v_token, 'practical unique index MAIN dup', v_token
    );
  EXCEPTION WHEN unique_violation THEN
    v_dup := true;
  END;
  IF NOT v_dup THEN
    RAISE EXCEPTION 'expected duplicate MAIN+token to be rejected';
  END IF;

  INSERT INTO public.bodyshop_settlement_lines (
    settlement_id, repair_card_id, party, line_type, component, amount,
    txn_date, reference, remarks, import_row_token
  ) VALUES (
    v_s.id, v_s.repair_card_id, 'customer', 'receipt', 'CUSTOMER', 1.00,
    CURRENT_DATE, v_token, 'practical unique index CP after DO', v_token
  );

  BEGIN
    INSERT INTO public.bodyshop_settlement_lines (
      settlement_id, repair_card_id, party, line_type, component, amount,
      txn_date, reference, remarks, import_row_token
    ) VALUES (
      v_s.id, v_s.repair_card_id, 'customer', 'receipt', 'CUSTOMER', 1.00,
      CURRENT_DATE, v_token, 'practical unique index CP dup', v_token
    );
  EXCEPTION WHEN unique_violation THEN
    v_cp_dup := true;
  END;
  IF NOT v_cp_dup THEN
    RAISE EXCEPTION 'expected duplicate CUSTOMER+token to be rejected';
  END IF;
END $$;

SELECT true AS import_row_token_component_idempotency_ok;

ROLLBACK;
