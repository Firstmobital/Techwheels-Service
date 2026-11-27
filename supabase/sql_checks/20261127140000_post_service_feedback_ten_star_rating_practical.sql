-- Transactional practical verification tests for DBL-0106 (all writes rolled back at the end).
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
-- Run ONLY after 20261127140000_post_service_feedback_ten_star_rating.sql has been applied (e.g. on isolated local PostgreSQL).

BEGIN;

-- Use a deterministic high job_card_closed_data_id range that cannot collide with existing rows.
-- Test 1: Insert all 10 valid rating values (1..10) + NULL rating; verify effective_rating, classification, and bot routing.
INSERT INTO public.post_service_feedback_messages (
  job_card_closed_data_id, customer_name, mobile_number, vehicle_registration_number,
  job_card_number, closed_date, scheduled_for_date, sent_at, template_name,
  status, rating, feedback_text, responded_at, cre_status, next_follow_up_date,
  request_rating_scale, rating_scale
)
SELECT
  900000000 + g,
  'Test Customer ' || g,
  '90000000' || LPAD(g::text, 2, '0'),
  'RJ14TS00' || LPAD(g::text, 2, '0'),
  'JC-TEST-' || g,
  CURRENT_DATE - 1,
  CURRENT_DATE,
  now(),
  'post_service_feedback_v2',
  'responded',
  g::smallint,
  'Test feedback ' || g || '/10',
  now(),
  'open',
  (timezone('Asia/Kolkata', now()))::date,
  10,
  10
FROM generate_series(1, 10) AS g;

-- Null rating (No Response) row
INSERT INTO public.post_service_feedback_messages (
  job_card_closed_data_id, customer_name, mobile_number, vehicle_registration_number,
  job_card_number, closed_date, scheduled_for_date, sent_at, template_name,
  status, rating, feedback_text, responded_at, cre_status, next_follow_up_date,
  request_rating_scale, rating_scale
)
VALUES (
  900000099, 'Test Unrated', '9000000099', 'RJ14TS0099',
  'JC-TEST-NULL', CURRENT_DATE - 1, CURRENT_DATE, now(), 'post_service_feedback_v2',
  'sent', NULL, NULL, NULL, 'open', (timezone('Asia/Kolkata', now()))::date,
  10, 10
);

-- Verify:
--  * Ratings 1..7 appear in Needs Follow-up (<=7), due_today view, and post_feedback_bot_data (7 rows)
--  * Ratings 8..10 appear in Positive (>=8), NOT in due_today view, and NOT in post_feedback_bot_data (3 rows)
--  * Rating NULL appears in cre_unrated view and due_today view, NOT in cre_queue, NOT in bot table
DO $$
DECLARE
  v_followup_cnt int;
  v_positive_cnt int;
  v_unrated_cnt int;
  v_due_today_rated_cnt int;
  v_due_today_unrated_cnt int;
  v_bot_cnt int;
  v_bot_max smallint;
  v_r7_in_followup boolean;
  v_r8_in_positive boolean;
  v_r9_stored smallint;
  v_r5_stored smallint;
  v_r1_stored smallint;
  v_rejected_0 boolean := false;
  v_rejected_11 boolean := false;
  v_rejected_cre_0 boolean := false;
  v_rejected_cre_11 boolean := false;
BEGIN
  SELECT COUNT(*) INTO v_followup_cnt
  FROM public.post_service_feedback_cre_queue
  WHERE job_card_closed_data_id BETWEEN 900000001 AND 900000010 AND effective_rating <= 7;

  SELECT COUNT(*) INTO v_positive_cnt
  FROM public.post_service_feedback_cre_queue
  WHERE job_card_closed_data_id BETWEEN 900000001 AND 900000010 AND effective_rating >= 8;

  SELECT COUNT(*) INTO v_unrated_cnt
  FROM public.post_service_feedback_cre_unrated
  WHERE job_card_closed_data_id = 900000099;

  SELECT COUNT(*) INTO v_due_today_rated_cnt
  FROM public.post_service_feedback_cre_due_today
  WHERE job_card_closed_data_id BETWEEN 900000001 AND 900000010;

  SELECT COUNT(*) INTO v_due_today_unrated_cnt
  FROM public.post_service_feedback_cre_due_today
  WHERE job_card_closed_data_id = 900000099;

  SELECT COUNT(*), MAX(b.rating) INTO v_bot_cnt, v_bot_max
  FROM public.post_feedback_bot_data b
  JOIN public.post_service_feedback_messages m ON m.id = b.source_feedback_message_id
  WHERE m.job_card_closed_data_id BETWEEN 900000001 AND 900000010;

  SELECT EXISTS(
    SELECT 1 FROM public.post_service_feedback_cre_queue
    WHERE job_card_closed_data_id = 900000007 AND effective_rating <= 7
  ) INTO v_r7_in_followup;

  SELECT EXISTS(
    SELECT 1 FROM public.post_service_feedback_cre_queue
    WHERE job_card_closed_data_id = 900000008 AND effective_rating >= 8
  ) INTO v_r8_in_positive;

  SELECT rating INTO v_r1_stored FROM public.post_service_feedback_messages WHERE job_card_closed_data_id = 900000001;
  SELECT rating INTO v_r5_stored FROM public.post_service_feedback_messages WHERE job_card_closed_data_id = 900000005;
  SELECT rating INTO v_r9_stored FROM public.post_service_feedback_messages WHERE job_card_closed_data_id = 900000009;

  ASSERT v_followup_cnt = 7, format('Expected 7 follow-up rows (1..7), got %s', v_followup_cnt);
  ASSERT v_positive_cnt = 3, format('Expected 3 positive rows (8..10), got %s', v_positive_cnt);
  ASSERT v_unrated_cnt = 1, format('Expected 1 unrated row, got %s', v_unrated_cnt);
  ASSERT v_due_today_rated_cnt = 7, format('Expected 7 rated due_today rows (1..7), got %s', v_due_today_rated_cnt);
  ASSERT v_due_today_unrated_cnt = 1, format('Expected 1 unrated due_today row, got %s', v_due_today_unrated_cnt);
  ASSERT v_bot_cnt = 7 AND v_bot_max = 7, format('Expected 7 bot rows with max=7, got count=%s max=%s', v_bot_cnt, v_bot_max);
  ASSERT v_r7_in_followup, 'Rating 7 must appear in Needs Follow-up';
  ASSERT v_r8_in_positive, 'Rating 8 must appear in Positive';
  ASSERT v_r1_stored = 1 AND v_r5_stored = 5 AND v_r9_stored = 9, 'Native ratings 1, 5, 9 must store verbatim';

  -- Invalid rating 0 rejected by CHECK constraint
  BEGIN
    INSERT INTO public.post_service_feedback_messages (
      job_card_closed_data_id, mobile_number, closed_date, scheduled_for_date, rating
    ) VALUES (900000100, '9000000100', CURRENT_DATE, CURRENT_DATE, 0);
  EXCEPTION WHEN check_violation THEN
    v_rejected_0 := true;
  END;
  ASSERT v_rejected_0, 'Rating 0 must be rejected by psfm_rating_check';

  -- Invalid rating 11 rejected by CHECK constraint
  BEGIN
    INSERT INTO public.post_service_feedback_messages (
      job_card_closed_data_id, mobile_number, closed_date, scheduled_for_date, rating
    ) VALUES (900000101, '9000000101', CURRENT_DATE, CURRENT_DATE, 11);
  EXCEPTION WHEN check_violation THEN
    v_rejected_11 := true;
  END;
  ASSERT v_rejected_11, 'Rating 11 must be rejected by psfm_rating_check';

  -- Invalid cre_rating 0 rejected by CHECK constraint
  BEGIN
    UPDATE public.post_service_feedback_messages SET cre_rating = 0 WHERE job_card_closed_data_id = 900000099;
  EXCEPTION WHEN check_violation THEN
    v_rejected_cre_0 := true;
  END;
  ASSERT v_rejected_cre_0, 'CRE rating 0 must be rejected by psfm_cre_rating_check';

  -- Invalid cre_rating 11 rejected by CHECK constraint
  BEGIN
    UPDATE public.post_service_feedback_messages SET cre_rating = 11 WHERE job_card_closed_data_id = 900000099;
  EXCEPTION WHEN check_violation THEN
    v_rejected_cre_11 := true;
  END;
  ASSERT v_rejected_cre_11, 'CRE rating 11 must be rejected by psfm_cre_rating_check';

  RAISE NOTICE 'ALL PRACTICAL DB ASSERTIONS PASSED';
END;
$$;

SELECT 'practical_tests_passed' AS status;

ROLLBACK;
