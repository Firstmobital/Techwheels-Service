-- PARTS-002 / DBL-0063
-- Add Make (BS4 / BS6) to Settings Estimate & Parts Master.
-- Existing rows backfill BS6. Unique identity includes make.
-- Rollback:
--   drop index if exists public.settings_service_parts_pricing_identity_unique;
--   create unique index settings_service_parts_pricing_identity_unique
--     on public.settings_service_parts_pricing (
--       lower(btrim(model)), lower(btrim(fuel)), lower(btrim(service_type)), lower(btrim(service_name))
--     ) where is_active = true;
--   alter table public.settings_service_parts_pricing drop column if exists make;
-- Execution: This file can be run in one go.

begin;

alter table public.settings_service_parts_pricing
  add column if not exists make text;

update public.settings_service_parts_pricing
set make = 'BS6'
where make is null or btrim(make) = '';

alter table public.settings_service_parts_pricing
  alter column make set default 'BS6';

alter table public.settings_service_parts_pricing
  alter column make set not null;

alter table public.settings_service_parts_pricing
  drop constraint if exists settings_service_parts_pricing_make_check;

alter table public.settings_service_parts_pricing
  add constraint settings_service_parts_pricing_make_check
  check (make = any (array['BS4'::text, 'BS6'::text]));

create or replace function public.settings_service_parts_pricing_normalize_v1()
returns trigger
language plpgsql
as $$
begin
  new.dealer_code := 'GLOBAL';
  new.service_type := btrim(regexp_replace(new.service_type, '\s+', ' ', 'g'));
  new.model := btrim(regexp_replace(new.model, '\s+', ' ', 'g'));
  new.fuel := btrim(regexp_replace(new.fuel, '\s+', ' ', 'g'));
  new.make := upper(btrim(regexp_replace(coalesce(new.make, 'BS6'), '\s+', '', 'g')));
  if new.make not in ('BS4', 'BS6') then
    new.make := 'BS6';
  end if;
  new.service_name := btrim(regexp_replace(new.service_name, '\s+', ' ', 'g'));
  new.updated_at := now();
  if length(new.service_type) = 0 or length(new.model) = 0 or length(new.fuel) = 0 or length(new.make) = 0 or length(new.service_name) = 0 then
    raise exception 'Catalogue model, fuel, make, service type, and item name cannot be empty';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_settings_service_parts_pricing_normalize_v1 on public.settings_service_parts_pricing;
create trigger trg_settings_service_parts_pricing_normalize_v1
  before insert or update of dealer_code, service_type, model, fuel, make, service_name
  on public.settings_service_parts_pricing
  for each row
  execute function public.settings_service_parts_pricing_normalize_v1();

drop index if exists public.settings_service_parts_pricing_identity_unique;
create unique index settings_service_parts_pricing_identity_unique
  on public.settings_service_parts_pricing (
    lower(btrim(model)),
    lower(btrim(fuel)),
    lower(btrim(service_type)),
    lower(btrim(service_name)),
    lower(btrim(make))
  )
  where is_active = true;

drop index if exists public.settings_service_parts_pricing_lookup;
create index settings_service_parts_pricing_lookup
  on public.settings_service_parts_pricing (model, service_type, fuel, make);

comment on column public.settings_service_parts_pricing.make is
  'Bharat Stage variant shown as Make on Estimate Master. BS4 or BS6 only.';

commit;
