-- Read-only verification checks for:
-- supabase/migrations/20260702130000_post_service_feedback_cre_add_branch.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) View definition includes the new branch column.
SELECT pg_get_viewdef('public.post_service_feedback_cre_queue'::regclass, true) AS view_def;

-- 2) Existing queue rows return vehicle_registration_number and branch values.
SELECT id, customer_name, vehicle_registration_number, branch
FROM public.post_service_feedback_cre_queue
ORDER BY id;
