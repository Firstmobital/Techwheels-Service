-- Read-only checks for next_follow_up_date on the CRE feedback case.

SELECT
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'post_service_feedback_messages'
      AND column_name = 'next_follow_up_date'
      AND data_type = 'date'
  ) AS next_follow_up_date_is_date;

SELECT
  pg_get_function_identity_arguments('public.psf_add_remark'::regproc) AS add_remark_args,
  pg_get_function_identity_arguments('public.psf_mark_resolved'::regproc) AS mark_resolved_args;

SELECT
  to_regclass('public.post_service_feedback_cre_due_today') IS NOT NULL AS due_today_view_present,
  (timezone('Asia/Kolkata', now()))::date AS kolkata_today;

SELECT pg_get_viewdef('public.post_service_feedback_cre_due_today'::regclass, true) AS due_today_def;

SELECT
  COUNT(*) FILTER (WHERE rating IS NULL) AS queue_unrated,
  COUNT(*) FILTER (WHERE rating >= 4) AS queue_4_plus,
  COUNT(*) FILTER (WHERE rating <= 3) AS queue_3_or_less
FROM public.post_service_feedback_cre_queue;

SELECT
  COUNT(*) AS due_today_count,
  COUNT(*) FILTER (WHERE cre_status = 'resolved') AS due_today_resolved,
  COUNT(*) FILTER (WHERE next_follow_up_date IS DISTINCT FROM (timezone('Asia/Kolkata', now()))::date) AS due_today_not_today,
  COUNT(*) FILTER (WHERE rating >= 4) AS due_today_positive
FROM public.post_service_feedback_cre_due_today;
