-- Disposable cases proving Today's Follow-ups uses next_follow_up_date, not closed_date.
-- Rolls back. Does not leave rows behind.

BEGIN;

DO $$
DECLARE
  v_today date := (timezone('Asia/Kolkata', now()))::date;
  v_a bigint;
  v_b bigint;
  v_a_in boolean;
  v_b_in boolean;
  v_a_after_tomorrow boolean;
  v_a_after_clear boolean;
  v_a_resolved boolean;
  v_a_date date;
  v_remarks int;
BEGIN
  INSERT INTO public.post_service_feedback_messages (
    job_card_closed_data_id, customer_name, mobile_number, vehicle_registration_number,
    job_card_number, closed_date, scheduled_for_date, sent_at, status, rating,
    feedback_text, responded_at, cre_status, template_name, next_follow_up_date
  ) VALUES (
    -240924001, 'PSF FOLLOWUP A DO NOT CALL', '0000002401', 'TS00TESTA',
    'TEST-PSF-FOLLOWUP-A', v_today - 4, v_today - 4, now(), 'responded', 2,
    'case a', now(), 'open', 'cre_followup_test', v_today
  ) RETURNING id INTO v_a;

  INSERT INTO public.post_service_feedback_messages (
    job_card_closed_data_id, customer_name, mobile_number, vehicle_registration_number,
    job_card_number, closed_date, scheduled_for_date, sent_at, status, rating,
    feedback_text, responded_at, cre_status, template_name, next_follow_up_date
  ) VALUES (
    -240924002, 'PSF FOLLOWUP B DO NOT CALL', '0000002402', 'TS00TESTB',
    'TEST-PSF-FOLLOWUP-B', v_today, v_today, now(), 'responded', 2,
    'case b', now(), 'open', 'cre_followup_test', NULL
  ) RETURNING id INTO v_b;

  SELECT EXISTS (SELECT 1 FROM public.post_service_feedback_cre_due_today WHERE id = v_a) INTO v_a_in;
  SELECT EXISTS (SELECT 1 FROM public.post_service_feedback_cre_due_today WHERE id = v_b) INTO v_b_in;
  IF NOT v_a_in THEN
    RAISE EXCEPTION 'case A (service date earlier, follow-up today) missing from due today';
  END IF;
  IF v_b_in THEN
    RAISE EXCEPTION 'case B (service date today, follow-up null) appeared in due today';
  END IF;

  UPDATE public.post_service_feedback_messages
  SET next_follow_up_date = v_today + 1, updated_at = now()
  WHERE id = v_a;
  SELECT EXISTS (SELECT 1 FROM public.post_service_feedback_cre_due_today WHERE id = v_a) INTO v_a_after_tomorrow;
  IF v_a_after_tomorrow THEN
    RAISE EXCEPTION 'case A remained in due today after follow-up moved to tomorrow';
  END IF;

  UPDATE public.post_service_feedback_messages
  SET next_follow_up_date = v_today, cre_status = 'resolved', updated_at = now()
  WHERE id = v_a;
  SELECT EXISTS (SELECT 1 FROM public.post_service_feedback_cre_due_today WHERE id = v_a) INTO v_a_resolved;
  SELECT next_follow_up_date INTO v_a_date FROM public.post_service_feedback_messages WHERE id = v_a;
  IF v_a_resolved THEN
    RAISE EXCEPTION 'resolved case A remained in due today';
  END IF;
  IF v_a_date IS DISTINCT FROM v_today THEN
    RAISE EXCEPTION 'resolving cleared next_follow_up_date';
  END IF;

  UPDATE public.post_service_feedback_messages
  SET next_follow_up_date = NULL, cre_status = 'in_progress', updated_at = now()
  WHERE id = v_a;
  SELECT EXISTS (SELECT 1 FROM public.post_service_feedback_cre_due_today WHERE id = v_a) INTO v_a_after_clear;
  IF v_a_after_clear THEN
    RAISE EXCEPTION 'cleared follow-up date still matched due today';
  END IF;

  INSERT INTO public.post_service_feedback_remarks (feedback_id, remark, created_by_name, is_resolution)
  VALUES (v_a, 'first remark', 'audit', false), (v_a, 'second remark', 'audit', false);
  UPDATE public.post_service_feedback_messages
  SET next_follow_up_date = v_today + 3
  WHERE id = v_a;
  SELECT COUNT(*) INTO v_remarks FROM public.post_service_feedback_remarks WHERE feedback_id = v_a;
  IF v_remarks <> 2 THEN
    RAISE EXCEPTION 'remark history changed while the follow-up date was updated';
  END IF;

  RAISE NOTICE 'psf_followup_ok case_a=% case_b=% kolkata_today=%', v_a, v_b, v_today;
END
$$;

ROLLBACK;
