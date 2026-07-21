-- Checks for 20260721150000_p1_12_service_history_chassis_indexes.sql

select
  indexname,
  indexdef ilike '%upper(btrim(chassis_no))%' as has_chassis_norm_expr,
  indexdef ilike '%service_date_time%' as has_service_date_time
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_ev_service_history_test_chassis_norm',
    'idx_pv_service_history_test_chassis_norm'
  )
order by indexname;
