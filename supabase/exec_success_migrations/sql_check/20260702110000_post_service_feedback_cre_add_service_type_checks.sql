-- Read-only verification checks for:
-- supabase/migrations/20260702110000_post_service_feedback_cre_add_service_type.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) View definition includes the new service_type column, sourced from job_card_closed_data.sr_type.
SELECT pg_get_viewdef('public.post_service_feedback_cre_queue'::regclass, true) AS view_def;

-- 2) Column is queryable and returns real values for existing queue rows.
SELECT id, customer_name, service_type, service_advisor_name
FROM public.post_service_feedback_cre_queue
ORDER BY id;
