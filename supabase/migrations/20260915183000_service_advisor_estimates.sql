-- PARTS-002 / DBL-0064
-- Service Advisor mechanical Create Estimate save store.
-- One row per service_reception_entries.id. Not AutoDoc estimate_rows. Not customer_estimates.
-- Rollback:
--   drop table if exists public.service_advisor_estimates cascade;
-- Execution: This file can be run in one go.

begin;

create table if not exists public.service_advisor_estimates (
  id bigint generated always as identity primary key,
  reception_entry_id bigint not null unique
    references public.service_reception_entries(id) on delete cascade,
  dealer_code text not null,
  model text not null,
  fuel text not null,
  make text default 'BS6'::text not null,
  service_type text not null,
  items jsonb default '[]'::jsonb not null,
  parts_total numeric(12,2) default 0 not null,
  labour_total numeric(12,2) default 0 not null,
  grand_total numeric(12,2) default 0 not null,
  status text default 'Saved'::text not null,
  created_by text default coalesce((auth.jwt() ->> 'email'::text), (auth.uid())::text, 'system'::text) not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint service_advisor_estimates_model_not_blank check (length(btrim(model)) > 0),
  constraint service_advisor_estimates_fuel_check check (fuel = any (array['Petrol'::text, 'Diesel'::text, 'CNG'::text, 'EV'::text])),
  constraint service_advisor_estimates_make_check check (make = any (array['BS4'::text, 'BS6'::text])),
  constraint service_advisor_estimates_service_type_not_blank check (length(btrim(service_type)) > 0),
  constraint service_advisor_estimates_status_check check (status = 'Saved'::text),
  constraint service_advisor_estimates_parts_nonneg check (parts_total >= 0),
  constraint service_advisor_estimates_labour_nonneg check (labour_total >= 0),
  constraint service_advisor_estimates_grand_nonneg check (grand_total >= 0)
);

comment on table public.service_advisor_estimates is
  'SA mechanical Create Estimate drafts. One row per reception entry. Catalogue snapshot is split model + fuel + make + service_type. items jsonb is the line list.';

create index if not exists service_advisor_estimates_dealer_lookup
  on public.service_advisor_estimates (dealer_code, reception_entry_id);

create or replace function public.service_advisor_estimates_touch_v1()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.model := btrim(regexp_replace(new.model, '\s+', ' ', 'g'));
  new.fuel := btrim(regexp_replace(new.fuel, '\s+', ' ', 'g'));
  new.make := upper(btrim(regexp_replace(coalesce(new.make, 'BS6'), '\s+', '', 'g')));
  if new.make not in ('BS4', 'BS6') then
    new.make := 'BS6';
  end if;
  new.service_type := btrim(regexp_replace(new.service_type, '\s+', ' ', 'g'));
  if new.items is null then
    new.items := '[]'::jsonb;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_service_advisor_estimates_touch_v1 on public.service_advisor_estimates;
create trigger trg_service_advisor_estimates_touch_v1
  before insert or update of model, fuel, make, service_type, items, parts_total, labour_total, grand_total, status
  on public.service_advisor_estimates
  for each row
  execute function public.service_advisor_estimates_touch_v1();

alter table public.service_advisor_estimates enable row level security;

drop policy if exists service_advisor_estimates_select_v1 on public.service_advisor_estimates;
drop policy if exists service_advisor_estimates_insert_v1 on public.service_advisor_estimates;
drop policy if exists service_advisor_estimates_update_v1 on public.service_advisor_estimates;
drop policy if exists service_advisor_estimates_delete_v1 on public.service_advisor_estimates;

-- Inherit parent reception RLS: if the advisor can see the case, they can see/save its estimate.
create policy service_advisor_estimates_select_v1
  on public.service_advisor_estimates
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.service_reception_entries e
      where e.id = service_advisor_estimates.reception_entry_id
    )
  );

create policy service_advisor_estimates_insert_v1
  on public.service_advisor_estimates
  for insert
  to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.service_reception_entries e
      where e.id = service_advisor_estimates.reception_entry_id
    )
  );

create policy service_advisor_estimates_update_v1
  on public.service_advisor_estimates
  for update
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.service_reception_entries e
      where e.id = service_advisor_estimates.reception_entry_id
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.service_reception_entries e
      where e.id = service_advisor_estimates.reception_entry_id
    )
  );

create policy service_advisor_estimates_delete_v1
  on public.service_advisor_estimates
  for delete
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.service_reception_entries e
      where e.id = service_advisor_estimates.reception_entry_id
    )
  );

grant select, insert, update, delete on public.service_advisor_estimates to authenticated;
grant all on public.service_advisor_estimates to service_role;
grant usage, select on sequence public.service_advisor_estimates_id_seq to authenticated, service_role;

commit;
