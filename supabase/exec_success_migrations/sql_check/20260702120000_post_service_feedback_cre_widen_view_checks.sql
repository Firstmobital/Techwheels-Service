-- Read-only verification checks for:
-- supabase/migrations/20260702120000_post_service_feedback_cre_widen_view.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) View definition no longer restricts to rating <= 3, and includes review_link_sent.
SELECT pg_get_viewdef('public.post_service_feedback_cre_queue'::regclass, true) AS view_def;

-- 2) Row counts by rating tier (informational — confirms both tiers are now reachable).
SELECT
  COUNT(*) FILTER (WHERE rating >= 4) AS positive_count,
  COUNT(*) FILTER (WHERE rating <= 3) AS needs_followup_count,
  COUNT(*) AS total_responded
FROM public.post_service_feedback_cre_queue;

-- 3) Overall sent-message count (informational — independent of rating/response).
SELECT COUNT(*) AS total_messages_sent
FROM public.post_service_feedback_messages
WHERE sent_at IS NOT NULL;
