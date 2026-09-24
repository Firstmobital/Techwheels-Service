-- Read-only checks for CRE rating vs customer rating classification.

SELECT
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'post_service_feedback_messages'
      AND column_name = 'cre_rating'
      AND data_type = 'smallint'
  ) AS cre_rating_is_smallint,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'post_service_feedback_messages'
      AND column_name = 'effective_rating'
      AND is_generated = 'ALWAYS'
  ) AS effective_rating_is_generated;

SELECT pg_get_function_identity_arguments('public.psf_set_cre_rating'::regproc) AS set_cre_rating_args;

SELECT
  COUNT(*) FILTER (WHERE effective_rating IS NULL) AS queue_unrated,
  COUNT(*) FILTER (WHERE effective_rating >= 4) AS queue_4_plus,
  COUNT(*) FILTER (WHERE effective_rating <= 3) AS queue_3_or_less,
  COUNT(*) FILTER (WHERE rating IS NOT NULL AND cre_rating IS NOT NULL AND rating IS DISTINCT FROM effective_rating) AS overridden_customer_ratings
FROM public.post_service_feedback_cre_queue;

SELECT
  COUNT(*) AS unrated_count,
  COUNT(*) FILTER (WHERE effective_rating IS NOT NULL) AS unrated_with_effective,
  COUNT(*) FILTER (WHERE sent_at IS NULL) AS unrated_unsent
FROM public.post_service_feedback_cre_unrated;

SELECT
  COUNT(*) AS due_today_count,
  COUNT(*) FILTER (WHERE cre_status = 'resolved') AS due_today_resolved,
  COUNT(*) FILTER (WHERE effective_rating >= 4) AS due_today_positive
FROM public.post_service_feedback_cre_due_today;
