-- Cron worker was getting HTTP 401 from the Supabase Functions gateway because
-- insurance-renewal-telecalling was deployed with JWT verification enabled.
-- pg_net only sends x-cron-secret (auth is enforced inside the edge handler).
-- Deploy edge with verify_jwt=false (see supabase/config.toml), same pattern as
-- booking-source-sync and wa-* reminder functions.

COMMENT ON FUNCTION public.invoke_insurance_renewal_rc_fetch_worker() IS
  'pg_cron/pg_net wrapper for process_rc_fetch_jobs. '
  'Requires functions/v1/insurance-renewal-telecalling deployed with verify_jwt=false '
  '(otherwise net._http_response status_code=401 and jobs stay queued).';
