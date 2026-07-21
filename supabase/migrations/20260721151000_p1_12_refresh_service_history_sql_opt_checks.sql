-- Checks for 20260721151000_p1_12_refresh_service_history_sql_opt.sql

select
  p.proname,
  pg_get_functiondef(p.oid) ilike '%public.ev_service_history_test%' as references_ev,
  pg_get_functiondef(p.oid) ilike '%public.pv_service_history_test%' as references_pv,
  pg_get_functiondef(p.oid) ilike '%h.contact_full_name%' as uses_contact_column,
  pg_get_functiondef(p.oid) ilike '%to_jsonb(h)%' as still_uses_to_jsonb
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'refresh_all_service_data_from_service_history';

select public.refresh_all_service_data_from_service_history(p_chassis_key => '__CHECK_NO_MATCH__');
