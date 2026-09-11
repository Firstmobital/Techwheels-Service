-- OPS-PSF-BOT-001 / DBL-0049 controlled behavior tests (Tests A-I).
-- Uses distinctive prefixes so leftover rows can be identified and removed.
-- Always deletes test rows, including on failure.
-- Execution: run once against the linked project after the migration.

DO $$
DECLARE
  v_failed text := '';
  v_jc_a bigint; v_msg_a bigint; v_bot_a bigint;
  v_jc_b bigint; v_msg_b bigint;
  v_jc_c bigint; v_msg_c bigint;
  v_jc_d bigint; v_msg_d bigint;
  v_jc_e bigint; v_msg_e bigint;
  v_jc_f bigint; v_msg_f bigint;
  v_jc_g bigint; v_msg_g bigint;
  v_n integer;
  v_vrn text;
  v_mobile text;
  v_name text;
  v_rating smallint;
  v_feedback text;
  v_sa text;
  v_branch text;
  v_stype text;
  v_chassis text;
BEGIN
  -- Cleanup any leftover rows from a previous interrupted run.
  DELETE FROM public.post_feedback_bot_data
  WHERE source_feedback_message_id IN (
    SELECT id FROM public.post_service_feedback_messages
    WHERE customer_name LIKE '\_\_PSFBOT\_TEST\_%' ESCAPE '\'
  );
  DELETE FROM public.post_service_feedback_messages
  WHERE customer_name LIKE '\_\_PSFBOT\_TEST\_%' ESCAPE '\';
  DELETE FROM public.job_card_closed_data
  WHERE chassis_number LIKE '\_\_PSFBOT\_TEST\_%' ESCAPE '\';
  DELETE FROM public.all_service_data
  WHERE chassis_no LIKE '\_\_PSFBOT\_TEST\_%' ESCAPE '\';

  INSERT INTO public.job_card_closed_data (
    branch, chassis_number, vehicle_registration_number, sr_type, branch_label, sr_assigned_to
  ) VALUES
    ('TEST', '__PSFBOT_TEST_CH_A__', 'ZZPSFBOT01', 'Paid Service', 'Sitapura', 'Test Advisor A')
  RETURNING id INTO v_jc_a;

  INSERT INTO public.job_card_closed_data (
    branch, chassis_number, vehicle_registration_number, sr_type, branch_label, sr_assigned_to
  ) VALUES
    ('TEST', '__PSFBOT_TEST_CH_B__', 'ZZPSFBOT02', 'Running Repairs', 'Ajmer Road', 'Test Advisor B')
  RETURNING id INTO v_jc_b;

  INSERT INTO public.job_card_closed_data (
    branch, chassis_number, vehicle_registration_number, sr_type, branch_label, sr_assigned_to
  ) VALUES
    ('TEST', '__PSFBOT_TEST_CH_C__', 'ZZPSFBOT03', 'Paid Service', 'Tonk', 'Test Advisor C')
  RETURNING id INTO v_jc_c;

  INSERT INTO public.job_card_closed_data (
    branch, chassis_number, vehicle_registration_number, sr_type, branch_label, sr_assigned_to
  ) VALUES
    ('TEST', '__PSFBOT_TEST_CH_D__', 'ZZPSFBOT04', 'Paid Service', 'Tonk', 'Test Advisor D')
  RETURNING id INTO v_jc_d;

  INSERT INTO public.job_card_closed_data (
    branch, chassis_number, vehicle_registration_number, sr_type, branch_label, sr_assigned_to
  ) VALUES
    ('TEST', '__PSFBOT_TEST_CH_E__', 'ZZPSFBOT05', 'Paid Service', 'Shahpura', 'Test Advisor E')
  RETURNING id INTO v_jc_e;

  INSERT INTO public.job_card_closed_data (
    branch, chassis_number, vehicle_registration_number, sr_type, branch_label, sr_assigned_to
  ) VALUES
    ('TEST', '__PSFBOT_TEST_CH_F__', 'ZZPSFBOT06', 'Paid Service', 'Shahpura', 'Test Advisor F')
  RETURNING id INTO v_jc_f;

  INSERT INTO public.job_card_closed_data (
    branch, chassis_number, vehicle_registration_number, sr_type, branch_label, sr_assigned_to
  ) VALUES
    ('TEST', '__PSFBOT_TEST_CH_G__', 'ZZPSFBOT07', 'First Free Service', 'Sitapura', 'Test Advisor G')
  RETURNING id INTO v_jc_g;

  -- Test A: eligible rating 3
  INSERT INTO public.post_service_feedback_messages (
    job_card_closed_data_id, customer_name, mobile_number, vehicle_registration_number,
    closed_date, scheduled_for_date, status, rating, feedback_text, cre_status, responded_at
  ) VALUES (
    v_jc_a, '__PSFBOT_TEST_A__', '000PSFBOTA', 'ZZPSFBOT01',
    CURRENT_DATE, CURRENT_DATE, 'responded', 3, 'test A feedback', 'open', now()
  ) RETURNING id INTO v_msg_a;

  SELECT COUNT(*) INTO v_n FROM public.post_feedback_bot_data WHERE source_feedback_message_id = v_msg_a;
  IF v_n <> 1 THEN
    v_failed := v_failed || format(' A: expected 1 bot row, got %s;', v_n);
  END IF;

  -- Test B: rating 1
  INSERT INTO public.post_service_feedback_messages (
    job_card_closed_data_id, customer_name, mobile_number, vehicle_registration_number,
    closed_date, scheduled_for_date, status, rating, feedback_text, cre_status, responded_at
  ) VALUES (
    v_jc_b, '__PSFBOT_TEST_B__', '000PSFBOTB', 'ZZPSFBOT02',
    CURRENT_DATE, CURRENT_DATE, 'responded', 1, 'test B feedback', 'open', now()
  ) RETURNING id INTO v_msg_b;

  SELECT COUNT(*) INTO v_n FROM public.post_feedback_bot_data WHERE source_feedback_message_id = v_msg_b;
  IF v_n <> 1 THEN
    v_failed := v_failed || format(' B: expected 1 bot row, got %s;', v_n);
  END IF;

  -- Test C: rating 4 — no bot
  INSERT INTO public.post_service_feedback_messages (
    job_card_closed_data_id, customer_name, mobile_number, vehicle_registration_number,
    closed_date, scheduled_for_date, status, rating, feedback_text, cre_status, responded_at
  ) VALUES (
    v_jc_c, '__PSFBOT_TEST_C__', '000PSFBOTC', 'ZZPSFBOT03',
    CURRENT_DATE, CURRENT_DATE, 'responded', 4, 'test C feedback', 'open', now()
  ) RETURNING id INTO v_msg_c;

  SELECT COUNT(*) INTO v_n FROM public.post_feedback_bot_data WHERE source_feedback_message_id = v_msg_c;
  IF v_n <> 0 THEN
    v_failed := v_failed || format(' C: expected 0 bot rows, got %s;', v_n);
  END IF;

  -- Test D: rating 5 — no bot
  INSERT INTO public.post_service_feedback_messages (
    job_card_closed_data_id, customer_name, mobile_number, vehicle_registration_number,
    closed_date, scheduled_for_date, status, rating, feedback_text, cre_status, responded_at
  ) VALUES (
    v_jc_d, '__PSFBOT_TEST_D__', '000PSFBOTD', 'ZZPSFBOT04',
    CURRENT_DATE, CURRENT_DATE, 'responded', 5, 'test D feedback', 'open', now()
  ) RETURNING id INTO v_msg_d;

  SELECT COUNT(*) INTO v_n FROM public.post_feedback_bot_data WHERE source_feedback_message_id = v_msg_d;
  IF v_n <> 0 THEN
    v_failed := v_failed || format(' D: expected 0 bot rows, got %s;', v_n);
  END IF;

  -- Test E: rating 2, cre_status resolved — no bot
  INSERT INTO public.post_service_feedback_messages (
    job_card_closed_data_id, customer_name, mobile_number, vehicle_registration_number,
    closed_date, scheduled_for_date, status, rating, feedback_text, cre_status, responded_at
  ) VALUES (
    v_jc_e, '__PSFBOT_TEST_E__', '000PSFBOTE', 'ZZPSFBOT05',
    CURRENT_DATE, CURRENT_DATE, 'responded', 2, 'test E feedback', 'resolved', now()
  ) RETURNING id INTO v_msg_e;

  SELECT COUNT(*) INTO v_n FROM public.post_feedback_bot_data WHERE source_feedback_message_id = v_msg_e;
  IF v_n <> 0 THEN
    v_failed := v_failed || format(' E: expected 0 bot rows, got %s;', v_n);
  END IF;

  -- Test F: status sent, rating 2, cre open — no bot
  INSERT INTO public.post_service_feedback_messages (
    job_card_closed_data_id, customer_name, mobile_number, vehicle_registration_number,
    closed_date, scheduled_for_date, status, rating, feedback_text, cre_status
  ) VALUES (
    v_jc_f, '__PSFBOT_TEST_F__', '000PSFBOTF', 'ZZPSFBOT06',
    CURRENT_DATE, CURRENT_DATE, 'sent', 2, 'test F feedback', 'open'
  ) RETURNING id INTO v_msg_f;

  SELECT COUNT(*) INTO v_n FROM public.post_feedback_bot_data WHERE source_feedback_message_id = v_msg_f;
  IF v_n <> 0 THEN
    v_failed := v_failed || format(' F: expected 0 bot rows, got %s;', v_n);
  END IF;

  -- Test G: becomes eligible later
  INSERT INTO public.post_service_feedback_messages (
    job_card_closed_data_id, customer_name, mobile_number, vehicle_registration_number,
    closed_date, scheduled_for_date, status, rating, feedback_text, cre_status
  ) VALUES (
    v_jc_g, '__PSFBOT_TEST_G__', '000PSFBOTG', 'ZZPSFBOT07',
    CURRENT_DATE, CURRENT_DATE, 'sent', 2, 'test G feedback', 'open'
  ) RETURNING id INTO v_msg_g;

  SELECT COUNT(*) INTO v_n FROM public.post_feedback_bot_data WHERE source_feedback_message_id = v_msg_g;
  IF v_n <> 0 THEN
    v_failed := v_failed || format(' G-pre: expected 0 bot rows, got %s;', v_n);
  END IF;

  UPDATE public.post_service_feedback_messages
  SET status = 'responded', responded_at = now()
  WHERE id = v_msg_g;

  SELECT COUNT(*) INTO v_n FROM public.post_feedback_bot_data WHERE source_feedback_message_id = v_msg_g;
  IF v_n <> 1 THEN
    v_failed := v_failed || format(' G: expected 1 bot row after becoming eligible, got %s;', v_n);
  END IF;

  -- Test H: duplicate protection on same eligible identity
  UPDATE public.post_service_feedback_messages
  SET rating = rating
  WHERE id = v_msg_a;

  SELECT COUNT(*) INTO v_n FROM public.post_feedback_bot_data WHERE source_feedback_message_id = v_msg_a;
  IF v_n <> 1 THEN
    v_failed := v_failed || format(' H: expected still 1 bot row, got %s;', v_n);
  END IF;

  -- Test I: mapping
  SELECT
    b.vehicle_registration_number, b.mobile_number, b.customer_name, b.rating,
    b.feedback_text, b.service_advisor_name, b.branch, b.service_type, b.chassis_no, b.id
  INTO v_vrn, v_mobile, v_name, v_rating, v_feedback, v_sa, v_branch, v_stype, v_chassis, v_bot_a
  FROM public.post_feedback_bot_data b
  WHERE b.source_feedback_message_id = v_msg_a;

  IF v_vrn IS DISTINCT FROM 'ZZPSFBOT01'
     OR v_mobile IS DISTINCT FROM '000PSFBOTA'
     OR v_name IS DISTINCT FROM '__PSFBOT_TEST_A__'
     OR v_rating IS DISTINCT FROM 3
     OR v_feedback IS DISTINCT FROM 'test A feedback'
     OR v_sa IS DISTINCT FROM 'Test Advisor A'
     OR v_branch IS DISTINCT FROM 'Sitapura'
     OR v_stype IS DISTINCT FROM 'Paid Service'
     OR v_chassis IS DISTINCT FROM '__PSFBOT_TEST_CH_A__'
  THEN
    v_failed := v_failed || format(
      ' I: mapping mismatch vrn=%s mobile=%s name=%s rating=%s feedback=%s sa=%s branch=%s stype=%s chassis=%s;',
      v_vrn, v_mobile, v_name, v_rating, v_feedback, v_sa, v_branch, v_stype, v_chassis
    );
  END IF;

  -- Cleanup
  DELETE FROM public.post_feedback_bot_data
  WHERE source_feedback_message_id IN (v_msg_a, v_msg_b, v_msg_c, v_msg_d, v_msg_e, v_msg_f, v_msg_g);
  DELETE FROM public.post_service_feedback_messages
  WHERE id IN (v_msg_a, v_msg_b, v_msg_c, v_msg_d, v_msg_e, v_msg_f, v_msg_g);
  DELETE FROM public.job_card_closed_data
  WHERE id IN (v_jc_a, v_jc_b, v_jc_c, v_jc_d, v_jc_e, v_jc_f, v_jc_g);
  DELETE FROM public.all_service_data
  WHERE chassis_no LIKE '\_\_PSFBOT\_TEST\_%' ESCAPE '\';

  IF v_failed <> '' THEN
    RAISE EXCEPTION 'OPS-PSF-BOT-001 tests failed:%', v_failed;
  END IF;

  RAISE NOTICE 'OPS-PSF-BOT-001 Tests A-I PASSED';
EXCEPTION WHEN OTHERS THEN
  DELETE FROM public.post_feedback_bot_data
  WHERE source_feedback_message_id IN (
    SELECT id FROM public.post_service_feedback_messages
    WHERE customer_name LIKE '\_\_PSFBOT\_TEST\_%' ESCAPE '\'
  );
  DELETE FROM public.post_service_feedback_messages
  WHERE customer_name LIKE '\_\_PSFBOT\_TEST\_%' ESCAPE '\';
  DELETE FROM public.job_card_closed_data
  WHERE chassis_number LIKE '\_\_PSFBOT\_TEST\_%' ESCAPE '\';
  DELETE FROM public.all_service_data
  WHERE chassis_no LIKE '\_\_PSFBOT\_TEST\_%' ESCAPE '\';
  RAISE;
END $$;
