-- P1-12 / SUPABASE-003: index normalized chassis lookups on EV/PV service history.
-- refresh_all_service_data_from_service_history filters:
--   upper(btrim(chassis_no)) = v_key

create index if not exists idx_ev_service_history_test_chassis_norm
  on public.ev_service_history_test (
    upper(btrim(chassis_no)),
    service_date_time desc,
    created_at desc
  )
  where nullif(btrim(chassis_no), '') is not null;

create index if not exists idx_pv_service_history_test_chassis_norm
  on public.pv_service_history_test (
    upper(btrim(chassis_no)),
    service_date_time desc,
    created_at desc
  )
  where nullif(btrim(chassis_no), '') is not null;

comment on index public.idx_ev_service_history_test_chassis_norm is
  'Supports refresh_all_service_data_from_service_history chassis-key lookups on ev_service_history_test.';

comment on index public.idx_pv_service_history_test_chassis_norm is
  'Supports refresh_all_service_data_from_service_history chassis-key lookups on pv_service_history_test.';
