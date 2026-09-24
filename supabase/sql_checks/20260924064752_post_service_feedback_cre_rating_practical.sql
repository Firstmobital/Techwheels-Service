-- Disposable cases for CRE rating classification. Rolls back.

BEGIN;

DO $$
DECLARE
  v_today date := (timezone('Asia/Kolkata', now()))::date;
  v_a bigint;
  v_b bigint;
  v_c bigint;
  v_a_rating smallint;
  v_a_text text;
  v_a_closed date;
  v_a_follow date;
  v_a_effective smallint;
  v_b_rating smallint;
  v_b_effective smallint;
  v_c_rating smallint;
  v_c_text text;
  v_c_effective smallint;
  v_remarks int;
  v_in boolean;
BEGIN
  INSERT INTO public.post_service_feedback_messages (
    job_card_closed_data_id, customer_name, mobile_number, vehicle_registration_number,
    job_card_number, closed_date, scheduled_for_date, sent_at, status, rating,
    feedback_text, cre_status, template_name, next_follow_up_date
  ) VALUES (
    -240924101, 'PSF CRE RATING A DO NOT CALL', '0000002411', 'TS00RATA',
    'TEST-PSF-CRE-RATING-A', v_today - 2, v_today - 2, now(), 'sent', NULL,
    'original a', 'open', 'cre_rating_test', v_today
  ) RETURNING id INTO v_a;

  INSERT INTO public.post_service_feedback_messages (
    job_card_closed_data_id, customer_name, mobile_number, vehicle_registration_number,
    job_card_number, closed_date, scheduled_for_date, sent_at, status, rating,
    feedback_text, cre_status, template_name, next_follow_up_date
  ) VALUES (
    -240924102, 'PSF CRE RATING B DO NOT CALL', '0000002412', 'TS00RATB',
    'TEST-PSF-CRE-RATING-B', v_today - 3, v_today - 3, now(), 'delivered', NULL,
    'original b', 'in_progress', 'cre_rating_test', NULL
  ) RETURNING id INTO v_b;

  INSERT INTO public.post_service_feedback_messages (
    job_card_closed_data_id, customer_name, mobile_number, vehicle_registration_number,
    job_card_number, closed_date, scheduled_for_date, sent_at, status, rating,
    feedback_text, responded_at, cre_status, template_name, next_follow_up_date
  ) VALUES (
    -240924103, 'PSF CRE RATING C DO NOT CALL', '0000002413', 'TS00RATC',
    'TEST-PSF-CRE-RATING-C', v_today - 5, v_today - 5, now(), 'responded', 2,
    'customer said noisy brakes', now(), 'open', 'cre_rating_test', v_today
  ) RETURNING id INTO v_c;

  INSERT INTO public.post_service_feedback_remarks (feedback_id, remark, created_by_name, is_resolution)
  VALUES (v_a, 'keep this remark', 'audit', false);

  SELECT EXISTS (SELECT 1 FROM public.post_service_feedback_cre_unrated WHERE id = v_a) INTO v_in;
  IF NOT v_in THEN RAISE EXCEPTION 'case A missing from unrated before rating'; END IF;

  UPDATE public.post_service_feedback_messages
  SET cre_rating = 5, updated_at = now()
  WHERE id = v_a;
  SELECT rating, feedback_text, closed_date, next_follow_up_date, effective_rating
  INTO v_a_rating, v_a_text, v_a_closed, v_a_follow, v_a_effective
  FROM public.post_service_feedback_messages WHERE id = v_a;

  IF v_a_effective IS DISTINCT FROM 5 THEN RAISE EXCEPTION 'case A effective rating is %', v_a_effective; END IF;
  IF v_a_rating IS NOT NULL THEN RAISE EXCEPTION 'case A customer rating was overwritten'; END IF;
  IF v_a_text IS DISTINCT FROM 'original a' THEN RAISE EXCEPTION 'case A feedback text changed'; END IF;
  IF v_a_closed IS DISTINCT FROM (v_today - 2) THEN RAISE EXCEPTION 'case A service date changed'; END IF;
  IF v_a_follow IS DISTINCT FROM v_today THEN RAISE EXCEPTION 'case A follow-up date changed'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.post_service_feedback_cre_unrated WHERE id = v_a) INTO v_in;
  IF v_in THEN RAISE EXCEPTION 'case A remained in unrated after 5 stars'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.post_service_feedback_cre_queue WHERE id = v_a AND effective_rating >= 4) INTO v_in;
  IF NOT v_in THEN RAISE EXCEPTION 'case A missing from positive queue'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.post_service_feedback_cre_queue WHERE id = v_a AND effective_rating <= 3) INTO v_in;
  IF v_in THEN RAISE EXCEPTION 'case A still classified as needs follow-up'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.post_service_feedback_cre_due_today WHERE id = v_a) INTO v_in;
  IF v_in THEN RAISE EXCEPTION 'case A stayed in today after becoming positive'; END IF;

  UPDATE public.post_service_feedback_messages
  SET cre_rating = 2, next_follow_up_date = v_today, updated_at = now()
  WHERE id = v_b;
  SELECT rating, effective_rating INTO v_b_rating, v_b_effective
  FROM public.post_service_feedback_messages WHERE id = v_b;
  IF v_b_effective IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'case B effective rating is %', v_b_effective; END IF;
  IF v_b_rating IS NOT NULL THEN RAISE EXCEPTION 'case B customer rating was overwritten'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.post_service_feedback_cre_unrated WHERE id = v_b) INTO v_in;
  IF v_in THEN RAISE EXCEPTION 'case B remained in unrated after 2 stars'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.post_service_feedback_cre_queue WHERE id = v_b AND effective_rating <= 3) INTO v_in;
  IF NOT v_in THEN RAISE EXCEPTION 'case B missing from needs follow-up'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.post_service_feedback_cre_queue WHERE id = v_b AND effective_rating >= 4) INTO v_in;
  IF v_in THEN RAISE EXCEPTION 'case B appeared in positive'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.post_service_feedback_cre_due_today WHERE id = v_b) INTO v_in;
  IF NOT v_in THEN RAISE EXCEPTION 'case B left today after a 2-star rating'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.post_service_feedback_cre_due_today WHERE id = v_c) INTO v_in;
  IF NOT v_in THEN RAISE EXCEPTION 'case C missing from today before override'; END IF;
  UPDATE public.post_service_feedback_messages
  SET cre_rating = 4, updated_at = now()
  WHERE id = v_c;
  SELECT rating, feedback_text, effective_rating
  INTO v_c_rating, v_c_text, v_c_effective
  FROM public.post_service_feedback_messages WHERE id = v_c;
  IF v_c_rating IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'case C customer rating changed to %', v_c_rating; END IF;
  IF v_c_text IS DISTINCT FROM 'customer said noisy brakes' THEN RAISE EXCEPTION 'case C feedback text changed'; END IF;
  IF v_c_effective IS DISTINCT FROM 4 THEN RAISE EXCEPTION 'case C effective rating is %', v_c_effective; END IF;
  SELECT EXISTS (SELECT 1 FROM public.post_service_feedback_cre_queue WHERE id = v_c AND effective_rating <= 3) INTO v_in;
  IF v_in THEN RAISE EXCEPTION 'case C remained in needs follow-up after override to 4'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.post_service_feedback_cre_queue WHERE id = v_c AND effective_rating >= 4) INTO v_in;
  IF NOT v_in THEN RAISE EXCEPTION 'case C missing from positive after override'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.post_service_feedback_cre_due_today WHERE id = v_c) INTO v_in;
  IF v_in THEN RAISE EXCEPTION 'case C stayed in today after positive override'; END IF;

  SELECT COUNT(*) INTO v_remarks FROM public.post_service_feedback_remarks WHERE feedback_id = v_a;
  IF v_remarks <> 1 THEN RAISE EXCEPTION 'remark history changed'; END IF;

  RAISE NOTICE 'psf_cre_rating_ok a=% b=% c=%', v_a, v_b, v_c;
END
$$;

SELECT
  m.job_card_number,
  m.rating AS customer_rating,
  m.cre_rating,
  m.effective_rating,
  m.feedback_text,
  m.closed_date,
  m.next_follow_up_date,
  EXISTS (SELECT 1 FROM public.post_service_feedback_cre_unrated u WHERE u.id = m.id) AS in_unrated,
  EXISTS (SELECT 1 FROM public.post_service_feedback_cre_queue q WHERE q.id = m.id AND q.effective_rating <= 3) AS in_needs_followup,
  EXISTS (SELECT 1 FROM public.post_service_feedback_cre_queue q WHERE q.id = m.id AND q.effective_rating >= 4) AS in_positive,
  EXISTS (SELECT 1 FROM public.post_service_feedback_cre_due_today d WHERE d.id = m.id) AS in_today,
  (SELECT COUNT(*) FROM public.post_service_feedback_remarks r WHERE r.feedback_id = m.id) AS remarks
FROM public.post_service_feedback_messages m
WHERE m.job_card_number LIKE 'TEST-PSF-CRE-RATING-%'
ORDER BY m.job_card_number;

ROLLBACK;
