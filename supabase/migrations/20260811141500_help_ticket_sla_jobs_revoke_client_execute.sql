-- HELP-001 Phase 5 hardening follow-up:
-- Supabase default privileges re-granted EXECUTE on maintenance RPCs to anon/authenticated.
-- Restrict to service_role (+ postgres) only.

REVOKE ALL ON FUNCTION public.check_help_ticket_sla_breaches(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_help_ticket_sla_breaches(integer) FROM anon;
REVOKE ALL ON FUNCTION public.check_help_ticket_sla_breaches(integer) FROM authenticated;

REVOKE ALL ON FUNCTION public.auto_close_unverified_help_tickets(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_close_unverified_help_tickets(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.auto_close_unverified_help_tickets(integer, integer) FROM authenticated;

REVOKE ALL ON FUNCTION public.run_help_ticket_sla_jobs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_help_ticket_sla_jobs() FROM anon;
REVOKE ALL ON FUNCTION public.run_help_ticket_sla_jobs() FROM authenticated;

GRANT EXECUTE ON FUNCTION public.check_help_ticket_sla_breaches(integer) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.auto_close_unverified_help_tickets(integer, integer) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.run_help_ticket_sla_jobs() TO postgres, service_role;
