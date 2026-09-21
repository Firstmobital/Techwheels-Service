-- Read-only verification checks for:
-- supabase/migrations/20260921053311_post_service_feedback_cre_unrated.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) New view exists; existing responded queue is unchanged.
SELECT
  to_regclass('public.post_service_feedback_cre_unrated') IS NOT NULL AS unrated_view_present,
  to_regclass('public.post_service_feedback_cre_queue') IS NOT NULL AS responded_view_present;

SELECT pg_get_viewdef('public.post_service_feedback_cre_unrated'::regclass, true) AS unrated_view_def;
SELECT pg_get_viewdef('public.post_service_feedback_cre_queue'::regclass, true) AS responded_view_def;

-- 2) Existing CRE queue still responded-only.
SELECT
  COUNT(*) AS responded_queue_total,
  COUNT(*) FILTER (WHERE rating IS NULL) AS responded_queue_unrated,
  COUNT(*) FILTER (WHERE rating >= 4) AS responded_queue_4_plus,
  COUNT(*) FILTER (WHERE rating <= 3) AS responded_queue_3_or_less
FROM public.post_service_feedback_cre_queue;

-- 3) Unrated view matches messages-table authority and excludes failed/unsent.
SELECT
  (SELECT COUNT(*) FROM public.post_service_feedback_cre_unrated) AS unrated_view_count,
  (SELECT COUNT(*)
     FROM public.post_service_feedback_messages
    WHERE sent_at IS NOT NULL AND rating IS NULL) AS messages_sent_unrated,
  (SELECT COUNT(*)
     FROM public.post_service_feedback_cre_unrated
    WHERE sent_at IS NULL OR rating IS NOT NULL) AS unrated_view_violations,
  (SELECT COUNT(*)
     FROM public.post_service_feedback_messages m
    WHERE m.status = 'failed'
      AND EXISTS (
        SELECT 1 FROM public.post_service_feedback_cre_unrated u WHERE u.id = m.id
      )) AS failed_rows_in_unrated_view;

-- 4) Overview count authorities on the messages table.
SELECT
  COUNT(*) FILTER (WHERE sent_at IS NOT NULL) AS messages_sent,
  COUNT(*) FILTER (WHERE sent_at IS NOT NULL AND rating >= 4) AS rated_4_plus,
  COUNT(*) FILTER (WHERE sent_at IS NOT NULL AND rating <= 3) AS rated_3_or_less,
  COUNT(*) FILTER (WHERE sent_at IS NOT NULL AND rating IS NULL) AS sent_unrated
FROM public.post_service_feedback_messages;

-- 5) Existing remark/resolve RPCs still have no rating predicate.
SELECT
  pg_get_functiondef('public.psf_add_remark(bigint,text)'::regprocedure) NOT ILIKE '%rating%' AS add_remark_has_no_rating_predicate,
  pg_get_functiondef('public.psf_mark_resolved(bigint,text)'::regprocedure) NOT ILIKE '%rating%' AS mark_resolved_has_no_rating_predicate;
