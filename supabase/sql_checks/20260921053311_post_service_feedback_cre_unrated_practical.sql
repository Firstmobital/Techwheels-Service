-- Practical write-path check for unrated CRE follow-up.
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
-- Inserts a disposable sent-unrated message, exercises the same remarks/cre_status
-- writes used by psf_add_remark / psf_mark_resolved, then deletes the row.
-- RPCs are invoked to prove they do not reject unrated IDs; SQL-editor auth is
-- expected to fail with Insufficient permissions (no JWT), not a rating error.

DELETE FROM public.post_service_feedback_messages
WHERE job_card_closed_data_id = -210921001
   OR job_card_number = 'TEST-PSF-UNRATED-20260921';

DO $$
DECLARE
  v_id bigint;
  v_rpc_add text;
  v_rpc_resolve text;
  v_in_view boolean;
  v_resolved_in_view boolean;
BEGIN
  INSERT INTO public.post_service_feedback_messages (
    job_card_closed_data_id,
    customer_name,
    mobile_number,
    vehicle_registration_number,
    job_card_number,
    closed_date,
    scheduled_for_date,
    sent_at,
    status,
    template_name
  ) VALUES (
    -210921001,
    'PSF CRE UNRATED TEST DO NOT CALL',
    '0000000001',
    NULL,
    'TEST-PSF-UNRATED-20260921',
    CURRENT_DATE,
    CURRENT_DATE,
    now(),
    'sent',
    'cre_unrated_test'
  )
  RETURNING id INTO v_id;

  BEGIN
    PERFORM public.psf_add_remark(v_id, 'unrated remark test');
    v_rpc_add := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_rpc_add := SQLERRM;
  END;

  INSERT INTO public.post_service_feedback_remarks
    (feedback_id, remark, created_by_name, is_resolution)
  VALUES (v_id, 'PSF unrated add-remark practical', 'audit', false);

  UPDATE public.post_service_feedback_messages
  SET cre_status = 'in_progress', updated_at = now()
  WHERE id = v_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.post_service_feedback_cre_unrated
    WHERE id = v_id
      AND cre_status = 'in_progress'
      AND rating IS NULL
      AND sent_at IS NOT NULL
  ) INTO v_in_view;

  IF NOT v_in_view THEN
    RAISE EXCEPTION 'unrated view missed in_progress test row %', v_id;
  END IF;

  BEGIN
    PERFORM public.psf_mark_resolved(v_id, 'unrated resolve test');
    v_rpc_resolve := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_rpc_resolve := SQLERRM;
  END;

  INSERT INTO public.post_service_feedback_remarks
    (feedback_id, remark, created_by_name, is_resolution)
  VALUES (v_id, 'PSF unrated mark-resolved practical', 'audit', true);

  UPDATE public.post_service_feedback_messages
  SET cre_status = 'resolved',
      resolved_at = now(),
      resolved_by_name = 'audit',
      updated_at = now()
  WHERE id = v_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.post_service_feedback_cre_unrated
    WHERE id = v_id AND cre_status = 'resolved'
  ) INTO v_resolved_in_view;

  IF NOT v_resolved_in_view THEN
    RAISE EXCEPTION 'unrated view missed resolved test row %', v_id;
  END IF;

  RAISE NOTICE 'psf_unrated_test_id=% rpc_add=% rpc_resolve=% in_progress_visible=% resolved_visible=%',
    v_id, v_rpc_add, v_rpc_resolve, v_in_view, v_resolved_in_view;

  DELETE FROM public.post_service_feedback_messages WHERE id = v_id;
END
$$;

SELECT
  (SELECT COUNT(*) FROM public.post_service_feedback_messages WHERE job_card_closed_data_id = -210921001) AS leftover_messages,
  (SELECT COUNT(*) FROM public.post_service_feedback_remarks r
     JOIN public.post_service_feedback_messages m ON m.id = r.feedback_id
    WHERE m.job_card_number = 'TEST-PSF-UNRATED-20260921') AS leftover_remarks,
  (SELECT COUNT(*) FROM public.post_feedback_bot_data WHERE vehicle_registration_number IS NULL AND customer_name = 'PSF CRE UNRATED TEST DO NOT CALL') AS leftover_bot;
