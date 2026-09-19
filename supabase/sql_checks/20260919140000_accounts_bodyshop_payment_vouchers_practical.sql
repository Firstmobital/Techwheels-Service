-- Practical ROLLBACK checks for DBL-0080.
-- Does not call nextval. Does not restart sequences. Restores no voucher numbers.
-- Execution: run in one go. Expected leftover_fail = 0.

BEGIN;

DO $$
DECLARE
  v_rapp_seq bigint;
  v_japp_seq bigint;
  v_rapp_seq_after bigint;
  v_japp_seq_after bigint;
  v_mech_rapp_0001 bigint;
  v_mech_japp_0140 bigint;
  v_null_mode_vouchered int;
  v_unsupported_vouchered int;
  v_protect_ok boolean := false;
  v_sample_id bigint;
  v_sample_voucher text;
  leftover_fail int := 0;
BEGIN
  SELECT last_value INTO v_rapp_seq FROM public.accounts_mechanical_voucher_rapp_2627_seq;
  SELECT last_value INTO v_japp_seq FROM public.accounts_mechanical_voucher_japp_2627_seq;

  SELECT id INTO v_mech_rapp_0001
    FROM public.accounts_mechanical_payment_lines
   WHERE voucher_no = 'RApp/26-27/0001';
  SELECT id INTO v_mech_japp_0140
    FROM public.accounts_mechanical_payment_lines
   WHERE voucher_no = 'JApp/26-27/0140';

  IF v_mech_rapp_0001 IS DISTINCT FROM 41 THEN
    leftover_fail := leftover_fail + 1;
    RAISE NOTICE 'FAIL mechanical RApp/0001 moved off line 41: %', v_mech_rapp_0001;
  END IF;
  IF v_mech_japp_0140 IS DISTINCT FROM 221 THEN
    leftover_fail := leftover_fail + 1;
    RAISE NOTICE 'FAIL mechanical JApp/0140 moved off line 221: %', v_mech_japp_0140;
  END IF;

  SELECT count(*) INTO v_null_mode_vouchered
    FROM public.bodyshop_settlement_lines
   WHERE party = 'customer'
     AND line_type = 'receipt'
     AND component = 'CUSTOMER'
     AND is_reversed = false
     AND payment_mode IS NULL
     AND voucher_no IS NOT NULL;
  IF v_null_mode_vouchered <> 0 THEN
    leftover_fail := leftover_fail + 1;
    RAISE NOTICE 'FAIL NULL payment_mode rows received vouchers: %', v_null_mode_vouchered;
  END IF;

  SELECT count(*) INTO v_unsupported_vouchered
    FROM public.bodyshop_settlement_lines
   WHERE payment_mode IN ('cheque', 'bank', 'other')
     AND voucher_no IS NOT NULL;
  IF v_unsupported_vouchered <> 0 THEN
    leftover_fail := leftover_fail + 1;
    RAISE NOTICE 'FAIL unsupported modes received vouchers: %', v_unsupported_vouchered;
  END IF;

  SELECT id INTO v_sample_id
    FROM public.bodyshop_settlement_lines
   WHERE party = 'customer'
     AND line_type = 'receipt'
     AND component = 'CUSTOMER'
   ORDER BY id
   LIMIT 1;
  IF v_sample_id IS NOT NULL THEN
    BEGIN
      UPDATE public.bodyshop_settlement_lines
         SET amount = amount + 1
       WHERE id = v_sample_id;
      leftover_fail := leftover_fail + 1;
      RAISE NOTICE 'FAIL append-only allowed amount update on id %', v_sample_id;
    EXCEPTION
      WHEN read_only_sql_transaction THEN
        NULL;
    END;
  END IF;

  SELECT id, voucher_no INTO v_sample_id, v_sample_voucher
    FROM public.bodyshop_settlement_lines
   WHERE voucher_no IS NOT NULL
   ORDER BY id
   LIMIT 1;
  IF v_sample_id IS NOT NULL THEN
    BEGIN
      UPDATE public.bodyshop_settlement_lines
         SET voucher_no = 'JApp/26-27/9999'
       WHERE id = v_sample_id;
      leftover_fail := leftover_fail + 1;
      RAISE NOTICE 'FAIL protect trigger allowed voucher rewrite on id %', v_sample_id;
    EXCEPTION
      WHEN check_violation THEN
        v_protect_ok := true;
      WHEN read_only_sql_transaction THEN
        v_protect_ok := true;
    END;
  ELSE
    v_protect_ok := true;
  END IF;
  IF NOT v_protect_ok THEN
    leftover_fail := leftover_fail + 1;
  END IF;

  SELECT last_value INTO v_rapp_seq_after FROM public.accounts_mechanical_voucher_rapp_2627_seq;
  SELECT last_value INTO v_japp_seq_after FROM public.accounts_mechanical_voucher_japp_2627_seq;
  IF v_rapp_seq_after IS DISTINCT FROM v_rapp_seq OR v_japp_seq_after IS DISTINCT FROM v_japp_seq THEN
    leftover_fail := leftover_fail + 1;
    RAISE NOTICE 'FAIL sequences moved during practical: rapp %→% japp %→%',
      v_rapp_seq, v_rapp_seq_after, v_japp_seq, v_japp_seq_after;
  END IF;

  RAISE NOTICE 'DBL-0080 practical leftover_fail=% rapp_seq=% japp_seq=% protect_ok=%',
    leftover_fail, v_rapp_seq, v_japp_seq, v_protect_ok;
  IF leftover_fail <> 0 THEN
    RAISE EXCEPTION 'DBL-0080 practical leftover_fail=%', leftover_fail;
  END IF;
END;
$$;

ROLLBACK;
