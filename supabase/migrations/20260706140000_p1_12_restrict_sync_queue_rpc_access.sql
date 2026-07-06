-- P1-12: Restrict access to process_all_service_history_sync_queue
--
-- Context: queryid=3220864789079889211 appeared in snapshot 14.32 with
-- calls=18636, delta_calls=14050, delta_total_ms=9299492.89 — a severe
-- regression. The function is a queue processor that should only be invoked
-- by internal jobs (pg_cron or service_role), never by unauthenticated or
-- regular authenticated clients.
--
-- The current ACL (GRANT ALL TO anon, authenticated) exposes the function via
-- PostgREST at /rest/v1/rpc/process_all_service_history_sync_queue, which
-- allows anyone to trigger large batch processing operations.
--
-- Fix: revoke from anon and authenticated; retain service_role access.
-- If the function is called by a pg_cron job or Edge Function, those use
-- service_role and will continue to work.

REVOKE ALL ON FUNCTION public.process_all_service_history_sync_queue(integer) FROM anon;
REVOKE ALL ON FUNCTION public.process_all_service_history_sync_queue(integer) FROM authenticated;

-- Also revoke enqueue function from anon (clients should not be able to
-- directly enqueue chassis syncs; triggers handle enqueueing internally).
REVOKE ALL ON FUNCTION public.enqueue_all_service_history_sync(text, interval) FROM anon;

COMMENT ON FUNCTION public.process_all_service_history_sync_queue(integer) IS
  'Processes due chassis refresh requests from queue with bounded batch size. '
  'Internal use only (pg_cron / service_role). Not exposed via PostgREST.';
