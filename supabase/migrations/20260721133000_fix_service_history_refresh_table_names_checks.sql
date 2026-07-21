-- Read-only verification for:
-- 20260721133000_fix_service_history_refresh_table_names.sql

-- 1) Source tables exist under lowercase names.
select
  c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('ev_service_history_test', 'pv_service_history_test')
order by c.relname;

-- 2) Function body should reference lowercase tables (not quoted mixed-case).
select
  p.proname,
  pg_get_functiondef(p.oid) ilike '%public.ev_service_history_test%' as references_ev,
  pg_get_functiondef(p.oid) ilike '%public.pv_service_history_test%' as references_pv,
  pg_get_functiondef(p.oid) ilike '%"EV_service_history_test"%' as still_has_quoted_ev,
  pg_get_functiondef(p.oid) ilike '%"PV_service_history_test"%' as still_has_quoted_pv
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'refresh_all_service_data_from_service_history';

-- 3) Smoke run (no matching chassis; should complete without 42P01).
select public.refresh_all_service_data_from_service_history(p_chassis_key => '__CHECK_NO_MATCH__');
