-- Practical verification for Stage 18 CP payment_mode persistence.
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
-- Inserts, if any, are rolled back.

-- Recalc / extra-over-DO behaviour is unchanged
SELECT
  pg_get_functiondef(p.oid) LIKE '%GREATEST%'
  AND pg_get_functiondef(p.oid) LIKE '%insurance_due_amount%'
    AS due_still_clamped_at_zero
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'recalc_bodyshop_settlement';

BEGIN;

DO $$
DECLARE
  v_s public.bodyshop_settlements%ROWTYPE;
  v_invalid boolean := false;
  v_mode text;
BEGIN
  SELECT * INTO v_s FROM public.bodyshop_settlements ORDER BY id LIMIT 1;
  IF NOT FOUND THEN
    RAISE NOTICE 'no settlement header; skipping insert-level payment_mode probe';
    RETURN;
  END IF;

  -- Historical-style CP row with no mode still inserts
  INSERT INTO public.bodyshop_settlement_lines (
    settlement_id, repair_card_id, party, line_type, component, amount,
    txn_date, reference, remarks
  ) VALUES (
    v_s.id, v_s.repair_card_id, 'customer', 'receipt', 'CUSTOMER', 1.00,
    CURRENT_DATE, 'historical-cp-no-mode', 'practical historical CP'
  );

  -- Insurance Main must accept NULL mode
  INSERT INTO public.bodyshop_settlement_lines (
    settlement_id, repair_card_id, party, line_type, component, amount,
    txn_date, reference, remarks, payment_mode
  ) VALUES (
    v_s.id, v_s.repair_card_id, 'insurance', 'do_component', 'MAIN', 1.00,
    CURRENT_DATE, 'practical-main-null-mode', 'practical MAIN', NULL
  );

  -- CP row with canonical mode
  INSERT INTO public.bodyshop_settlement_lines (
    settlement_id, repair_card_id, party, line_type, component, amount,
    txn_date, reference, remarks, payment_mode
  ) VALUES (
    v_s.id, v_s.repair_card_id, 'customer', 'receipt', 'CUSTOMER', 1.00,
    CURRENT_DATE, 'practical-cp-upi', 'practical CP UPI', 'upi'
  )
  RETURNING payment_mode INTO v_mode;
  IF v_mode IS DISTINCT FROM 'upi' THEN
    RAISE EXCEPTION 'expected CP payment_mode=upi, got %', v_mode;
  END IF;

  BEGIN
    INSERT INTO public.bodyshop_settlement_lines (
      settlement_id, repair_card_id, party, line_type, component, amount,
      txn_date, reference, remarks, payment_mode
    ) VALUES (
      v_s.id, v_s.repair_card_id, 'customer', 'receipt', 'CUSTOMER', 1.00,
      CURRENT_DATE, 'practical-cp-bad-mode', 'practical invalid', 'paypal'
    );
  EXCEPTION WHEN check_violation THEN
    v_invalid := true;
  END;
  IF NOT v_invalid THEN
    RAISE EXCEPTION 'expected invalid payment_mode to be rejected';
  END IF;
END
$$;

ROLLBACK;
