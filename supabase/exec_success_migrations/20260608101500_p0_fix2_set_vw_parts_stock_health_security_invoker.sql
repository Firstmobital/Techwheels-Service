-- SUPABASE-001 P0 Fix 2
-- Purpose: remove SECURITY DEFINER behavior flagged by Security Advisor on
-- public.vw_parts_stock_health.
-- Authoritative-safe change: only adjusts view security mode on existing view.

begin;

alter view if exists public.vw_parts_stock_health
  set (security_invoker = true);

commit;
