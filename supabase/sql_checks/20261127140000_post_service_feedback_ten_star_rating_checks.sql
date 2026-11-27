-- Read-only verification checks for DBL-0106 (20261127140000_post_service_feedback_ten_star_rating.sql).
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1. Schema columns and defaults
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'post_service_feedback_messages'
      AND column_name = 'request_rating_scale' AND data_type = 'smallint' AND column_default = '10'
  ) AS has_request_rating_scale_default_10,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'post_service_feedback_messages'
      AND column_name = 'rating_scale' AND data_type = 'smallint' AND column_default = '10'
  ) AS has_rating_scale_default_10,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'post_service_feedback_messages'
      AND column_name = 'rating_migrated_from_scale' AND data_type = 'smallint'
  ) AS has_rating_migrated_from_scale,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'post_service_feedback_messages'
      AND column_name = 'rating_migrated_at' AND data_type = 'timestamp with time zone'
  ) AS has_rating_migrated_at,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'post_feedback_bot_data'
      AND column_name = 'rating_scale' AND data_type = 'smallint'
  ) AS bot_has_rating_scale;

-- 2. CHECK constraints enforce 1-10
SELECT
  conname,
  pg_get_constraintdef(oid) AS constraint_def
FROM pg_constraint
WHERE conrelid IN ('public.post_service_feedback_messages'::regclass, 'public.post_feedback_bot_data'::regclass)
  AND contype = 'c'
ORDER BY conrelid::regclass::text, conname;

-- 3. Functions, view, and trigger definitions use 10-star thresholds (<=7, >=8, 1..10)
SELECT
  pg_get_functiondef('public.psf_set_cre_rating(bigint,smallint)'::regprocedure) LIKE '%> 10%' AS set_cre_rating_accepts_10,
  pg_get_functiondef('public.psf_get_today_productivity()'::regprocedure) LIKE '%effective_rating >= 8%' AS productivity_positive_is_8_plus,
  pg_get_functiondef('public.psf_get_today_productivity()'::regprocedure) LIKE '%effective_rating <= 7%' AS productivity_followup_is_7_or_less,
  pg_get_functiondef('public.insert_post_feedback_bot_from_message(bigint)'::regprocedure) LIKE '%m.rating <= 7%' AS bot_insert_threshold_is_7,
  pg_get_viewdef('public.post_service_feedback_cre_due_today'::regclass, true) LIKE '%effective_rating <= 7%' AS due_today_view_threshold_is_7,
  EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.post_service_feedback_messages'::regclass
      AND t.tgname = 'trg_route_eligible_post_feedback_to_bot'
      AND NOT t.tgisinternal
      AND pg_get_triggerdef(t.oid) LIKE '%rating <= 7%'
  ) AS bot_trigger_threshold_is_7,
  EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.post_service_feedback_messages'::regclass
      AND t.tgname = 'trg_psf_guard_legacy_scale_transition'
      AND NOT t.tgisinternal
  ) AS cutover_guard_trigger_present;

-- 4. Data integrity checks (zero unmigrated rated rows, zero out-of-range ratings, zero bad bot ratings)
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE rating_scale <> 10 AND (rating IS NOT NULL OR cre_rating IS NOT NULL)) AS unmigrated_rated_rows,
  COUNT(*) FILTER (WHERE rating_scale = 5 AND rating IS NULL AND cre_rating IS NULL) AS unrated_legacy_pending_rows,
  COUNT(*) FILTER (WHERE rating IS NOT NULL AND (rating < 1 OR rating > 10)) AS invalid_customer_ratings,
  COUNT(*) FILTER (WHERE cre_rating IS NOT NULL AND (cre_rating < 1 OR cre_rating > 10)) AS invalid_cre_ratings,
  COUNT(*) FILTER (WHERE rating_migrated_from_scale = 5 AND rating IS NOT NULL AND rating % 2 <> 0) AS migrated_odd_customer_ratings,
  COUNT(*) FILTER (WHERE sent_at IS NOT NULL) AS sent_rows,
  COUNT(*) FILTER (WHERE sent_at IS NOT NULL AND effective_rating >= 8) AS positive_8_plus,
  COUNT(*) FILTER (WHERE sent_at IS NOT NULL AND effective_rating <= 7) AS followup_7_or_less,
  COUNT(*) FILTER (WHERE sent_at IS NOT NULL AND effective_rating IS NULL) AS unrated_sent,
  COUNT(*) FILTER (WHERE request_rating_scale = 5) AS legacy_5star_requests,
  COUNT(*) FILTER (WHERE request_rating_scale = 10) AS new_10star_requests,
  ROUND(AVG(rating)::numeric, 4) AS avg_customer_rating_10,
  ROUND(AVG(effective_rating)::numeric, 4) AS avg_effective_rating_10
FROM public.post_service_feedback_messages;

-- 5. Rating distributions (customer, CRE, effective)
SELECT 'customer_rating' AS metric, rating AS score, COUNT(*) AS row_count
FROM public.post_service_feedback_messages
GROUP BY rating
UNION ALL
SELECT 'cre_rating' AS metric, cre_rating AS score, COUNT(*) AS row_count
FROM public.post_service_feedback_messages
GROUP BY cre_rating
UNION ALL
SELECT 'effective_rating' AS metric, effective_rating AS score, COUNT(*) AS row_count
FROM public.post_service_feedback_messages
GROUP BY effective_rating
ORDER BY metric, score NULLS LAST;

-- 6. Linked post_feedback_bot_data distribution & integrity
SELECT
  COUNT(*) AS linked_bot_rows,
  COUNT(*) FILTER (WHERE b.rating_scale <> 10 OR b.rating_scale IS NULL) AS linked_bot_unmigrated,
  COUNT(*) FILTER (WHERE b.rating IS DISTINCT FROM m.rating) AS linked_bot_rating_mismatch,
  COUNT(*) FILTER (WHERE b.rating > 7) AS linked_bot_rating_above_7
FROM public.post_feedback_bot_data b
JOIN public.post_service_feedback_messages m ON m.id = b.source_feedback_message_id;

-- 7. CRE view consistency checks
SELECT
  (SELECT COUNT(*) FROM public.post_service_feedback_cre_queue) AS cre_queue_total,
  (SELECT COUNT(*) FROM public.post_service_feedback_cre_queue WHERE effective_rating <= 7) AS cre_queue_followup,
  (SELECT COUNT(*) FROM public.post_service_feedback_cre_queue WHERE effective_rating >= 8) AS cre_queue_positive,
  (SELECT COUNT(*) FROM public.post_service_feedback_cre_unrated) AS cre_unrated_total,
  (SELECT COUNT(*) FROM public.post_service_feedback_cre_due_today) AS cre_due_today_total,
  (SELECT COUNT(*) FROM public.post_service_feedback_cre_due_today WHERE effective_rating >= 8 OR cre_status = 'resolved') AS cre_due_today_violations;
