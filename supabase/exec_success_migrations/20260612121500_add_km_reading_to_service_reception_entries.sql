begin;

alter table public.service_reception_entries
  add column if not exists km_reading integer;

alter table public.service_reception_entries
  drop constraint if exists service_reception_entries_km_reading_check;

alter table public.service_reception_entries
  add constraint service_reception_entries_km_reading_check
  check (km_reading is null or km_reading >= 0);

comment on column public.service_reception_entries.km_reading is 'Vehicle odometer (KM Reading) captured at intake.';

commit;
