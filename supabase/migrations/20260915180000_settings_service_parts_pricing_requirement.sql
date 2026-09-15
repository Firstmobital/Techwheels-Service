-- PARTS-002 / DBL-0065
-- Add Required/Optional toggle on Settings Estimate & Parts Master.
-- Not part of unique identity. Existing 877 rows backfill Required.
-- Rollback:
--   alter table public.settings_service_parts_pricing drop column if exists requirement;
-- Execution: This file can be run in one go.

begin;

alter table public.settings_service_parts_pricing
  add column if not exists requirement text;

update public.settings_service_parts_pricing
set requirement = 'Required'
where requirement is null or btrim(requirement) = '';

alter table public.settings_service_parts_pricing
  alter column requirement set default 'Required';

alter table public.settings_service_parts_pricing
  alter column requirement set not null;

alter table public.settings_service_parts_pricing
  drop constraint if exists settings_service_parts_pricing_requirement_check;

alter table public.settings_service_parts_pricing
  add constraint settings_service_parts_pricing_requirement_check
  check (requirement = any (array['Required'::text, 'Optional'::text]));

comment on column public.settings_service_parts_pricing.requirement is
  'Create Estimate prefills Required lines. Optional lines stay in Add Item. Not part of unique identity.';

commit;
