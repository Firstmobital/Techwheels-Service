-- Post-apply checks for 20260811140000_help_ticket_sla_cron_and_auto_close.sql

-- 1) Breach tracking columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'help_tickets'
  AND column_name IN ('sla_response_breached_at', 'sla_resolution_breached_at')
ORDER BY column_name;

-- 2) Functions exist, SECURITY DEFINER, owned/callable shape
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'check_help_ticket_sla_breaches',
    'auto_close_unverified_help_tickets',
    'run_help_ticket_sla_jobs'
  )
ORDER BY p.proname, args;

-- 3) authenticated must NOT have EXECUTE on maintenance RPCs
SELECT
  p.proname,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'check_help_ticket_sla_breaches',
    'auto_close_unverified_help_tickets',
    'run_help_ticket_sla_jobs'
  )
ORDER BY p.proname;

-- Expect: authenticated_can_execute = false for all three

-- 4) service_role / postgres can execute wrapper
SELECT
  has_function_privilege('service_role', 'public.run_help_ticket_sla_jobs()', 'EXECUTE')
    AS service_role_can_run,
  has_function_privilege('postgres', 'public.run_help_ticket_sla_jobs()', 'EXECUTE')
    AS postgres_can_run;

-- 5) Dealer-agnostic hardening: help_ticket_can_see / list_admin must not use my_dealer_code()
SELECT
  p.proname,
  (pg_get_functiondef(p.oid) ILIKE '%my_dealer_code%') AS uses_my_dealer_code
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'help_ticket_can_see',
    'help_ticket_list_admin',
    'help_ticket_list_mine',
    'check_help_ticket_sla_breaches',
    'auto_close_unverified_help_tickets',
    'run_help_ticket_sla_jobs'
  )
ORDER BY p.proname;

-- Expect: uses_my_dealer_code = false for all

-- 6) Pause-aware predicate present in breach checker
SELECT
  (pg_get_functiondef(p.oid) ILIKE '%sla_paused%') AS checks_sla_paused,
  (pg_get_functiondef(p.oid) ILIKE '%on_hold%') AS checks_on_hold,
  (pg_get_functiondef(p.oid) ILIKE '%waiting_raiser%') AS checks_waiting_raiser
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'check_help_ticket_sla_breaches'
  AND pg_get_function_identity_arguments(p.oid) = 'integer';

-- 7) Auto-close sets verification_status = auto_closed
SELECT
  (pg_get_functiondef(p.oid) ILIKE '%auto_closed%') AS sets_auto_closed
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'auto_close_unverified_help_tickets';

-- 8) pg_cron job (skip-friendly if extension absent)
SELECT
  EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AS pg_cron_installed;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'help-ticket cron jobs: %', (
      SELECT coalesce(json_agg(row_to_json(j)), '[]'::json)::text
      FROM (
        SELECT jobid, jobname, schedule, command, active
        FROM cron.job
        WHERE jobname = 'help-ticket-sla-jobs'
           OR command ILIKE '%run_help_ticket_sla_jobs%'
        ORDER BY jobid
      ) j
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — cron job check skipped';
  END IF;
END $$;

-- 9) Smoke: maintenance functions return ok without error (no matching rows expected)
SELECT public.run_help_ticket_sla_jobs();
