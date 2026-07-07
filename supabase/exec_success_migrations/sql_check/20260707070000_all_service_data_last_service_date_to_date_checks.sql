-- Read-only verification for 20260707070000_all_service_data_last_service_date_to_date.sql

-- 1. Column types are now date on both tables.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and column_name = 'last_service_date'
  and table_name in ('all_service_data', 'all_service_data_dynamic');
-- expect: data_type = 'date' for both rows

-- 2. New date-typed overload exists alongside the pre-existing text/timestamptz overloads.
select pg_get_function_identity_arguments(oid) as args
from pg_proc
where proname = 'calc_all_service_assumed_next_service_date'
  and pronamespace = 'public'::regnamespace
order by args;
-- expect 3 rows: (date, text, date) / (text, text, date) / (timestamp with time zone, text, date)

-- 3. Trigger-maintained assumed_next_service_date still computes for a sample of rows
--    with a non-null last_service_date (spot check against calc_* called directly).
select
  t.id,
  t.last_service_date,
  t.last_service_type,
  t.assumed_next_service_date,
  public.calc_all_service_assumed_next_service_date(t.last_service_date, t.last_service_type, current_date) as recomputed
from public.all_service_data t
where t.last_service_date is not null
order by t.id desc
limit 20;
-- expect: assumed_next_service_date = recomputed for every row

-- 4. No rows show a mismatch between assumed_next_service_date and a fresh recompute.
select count(*) as mismatched_rows
from public.all_service_data t
where t.assumed_next_service_date is distinct from
      public.calc_all_service_assumed_next_service_date(t.last_service_date, t.last_service_type, current_date);
-- expect: mismatched_rows = 0

-- 5. all_service_data_dynamic.last_service_date still matches its source row.
select count(*) as dynamic_mismatch_rows
from public.all_service_data_dynamic d
join public.all_service_data a on a.id = d.id
where d.last_service_date is distinct from a.last_service_date;
-- expect: dynamic_mismatch_rows = 0

-- 6. Sync/refresh functions still compile and are callable (no-op safe call with a key
--    that won't match anything real).
select public.refresh_all_service_data_from_job_card_closed_data(p_chassis_key => '__CHECK_NO_MATCH__');
select public.refresh_all_service_data_from_service_history(p_chassis_key => '__CHECK_NO_MATCH__');
select * from public.upsert_all_service_data_from_booking_source(p_chassis_no => '__CHECK_NO_MATCH__');
-- expect: all three execute without error; booking-source call returns action = 'skipped_missing_core_fields' or similar (chassis-only args), no rows touched
