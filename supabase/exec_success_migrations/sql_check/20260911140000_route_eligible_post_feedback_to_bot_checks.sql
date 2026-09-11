-- Read-only verification checks for:
-- supabase/migrations/20260911140000_route_eligible_post_feedback_to_bot.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Source column exists with compatible bigint type.
SELECT
  column_name,
  data_type,
  udt_name,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'post_feedback_bot_data'
  AND column_name = 'source_feedback_message_id';

-- 2) Unique constraint on source_feedback_message_id.
SELECT
  conname,
  contype,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.post_feedback_bot_data'::regclass
  AND conname = 'post_feedback_bot_data_source_feedback_message_id_key';

-- 3) FK to post_service_feedback_messages(id).
SELECT
  conname,
  contype,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.post_feedback_bot_data'::regclass
  AND conname = 'post_feedback_bot_data_source_feedback_message_id_fkey';

-- 4) Insert helper is SECURITY INVOKER (not DEFINER).
SELECT
  p.proname,
  p.prosecdef AS is_security_definer,
  pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'insert_post_feedback_bot_from_message';

-- 5) Trigger function is SECURITY INVOKER.
SELECT
  p.proname,
  p.prosecdef AS is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'route_eligible_post_feedback_to_bot';

-- 6) Trigger exists with eligibility WHEN clause on the messages table.
SELECT
  tgname,
  pg_get_triggerdef(oid, true) AS definition
FROM pg_trigger
WHERE tgrelid = 'public.post_service_feedback_messages'::regclass
  AND NOT tgisinternal
  AND tgname = 'trg_route_eligible_post_feedback_to_bot';

-- 7) CRE queue view is unchanged: all responded ratings, not bot-only.
SELECT pg_get_viewdef('public.post_service_feedback_cre_queue'::regclass, true) AS view_def;

-- 8) Bot table RLS posture unchanged (not enabled).
SELECT relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE oid = 'public.post_feedback_bot_data'::regclass;

SELECT polname
FROM pg_policy
WHERE polrelid = 'public.post_feedback_bot_data'::regclass
ORDER BY polname;

-- 9) Historical coverage: every currently eligible source row has exactly one bot row.
SELECT
  (SELECT COUNT(*)
   FROM public.post_service_feedback_messages m
   WHERE m.status = 'responded'
     AND m.rating IS NOT NULL
     AND m.rating <= 3
     AND m.cre_status = 'open') AS eligible_source_count,
  (SELECT COUNT(*)
   FROM public.post_feedback_bot_data
   WHERE source_feedback_message_id IS NOT NULL) AS bot_rows_with_source_id,
  (SELECT COUNT(*)
   FROM public.post_service_feedback_messages m
   WHERE m.status = 'responded'
     AND m.rating IS NOT NULL
     AND m.rating <= 3
     AND m.cre_status = 'open'
     AND EXISTS (
       SELECT 1
       FROM public.post_feedback_bot_data b
       WHERE b.source_feedback_message_id = m.id
     )) AS eligible_already_represented,
  (SELECT COUNT(*)
   FROM public.post_service_feedback_messages m
   WHERE m.status = 'responded'
     AND m.rating IS NOT NULL
     AND m.rating <= 3
     AND m.cre_status = 'open'
     AND NOT EXISTS (
       SELECT 1
       FROM public.post_feedback_bot_data b
       WHERE b.source_feedback_message_id = m.id
     )) AS eligible_missing_bot_row,
  (SELECT COUNT(*)
   FROM (
     SELECT source_feedback_message_id, COUNT(*) AS n
     FROM public.post_feedback_bot_data
     WHERE source_feedback_message_id IS NOT NULL
     GROUP BY source_feedback_message_id
     HAVING COUNT(*) > 1
   ) d) AS duplicate_source_ids;
