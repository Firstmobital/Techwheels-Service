-- Backfill missing SA employee codes for BODY SHOP Accident reception rows.
-- Purpose:
-- 1) Populate service_reception_entries.sa_employee_code where missing and name mapping is unambiguous.
-- 2) Synchronize bodyshop_repair_cards.sa_employee_code from reception rows by reception_entry_id.
--
-- Safety:
-- - Only Accident rows are touched.
-- - Only rows with NULL/blank sa_employee_code are backfilled in reception.
-- - Mapping uses unique normalized name matches in BODY SHOP + SA employee_master subset.

begin;

with bodyshop_sa_candidates as (
  select
    em.employee_code,
    lower(trim(em.employee_name)) as normalized_name
  from public.employee_master em
  where upper(trim(coalesce(em.department, ''))) in ('BODY SHOP', 'BODYSHOP')
    and upper(trim(coalesce(em.role, ''))) in ('SA', 'SERVICE ADVISOR')
    and em.employee_code is not null
),
unique_name_map as (
  select
    normalized_name,
    min(employee_code) as employee_code,
    count(*) as cnt
  from bodyshop_sa_candidates
  where normalized_name <> ''
  group by normalized_name
  having count(*) = 1
),
reception_targets as (
  select
    sre.id,
    unm.employee_code,
    coalesce(nullif(trim(sre.sa_display_name), ''), nullif(trim(sre.sa_name), '')) as resolved_sa_name
  from public.service_reception_entries sre
  join unique_name_map unm
    on unm.normalized_name = lower(trim(coalesce(nullif(trim(sre.sa_display_name), ''), nullif(trim(sre.sa_name), ''))))
  where sre.service_type = 'Accident'
    and coalesce(trim(sre.sa_employee_code), '') = ''
)
update public.service_reception_entries sre
set
  sa_employee_code = rt.employee_code,
  sa_display_name = coalesce(nullif(trim(sre.sa_display_name), ''), rt.resolved_sa_name, sre.sa_display_name),
  updated_at = now()
from reception_targets rt
where sre.id = rt.id;

-- Keep bodyshop cards aligned with canonical reception SA mapping.
with source_reception as (
  select
    sre.id as reception_entry_id,
    nullif(trim(sre.sa_employee_code), '') as sa_employee_code,
    coalesce(nullif(trim(sre.sa_display_name), ''), nullif(trim(sre.sa_name), '')) as sa_name
  from public.service_reception_entries sre
  where sre.service_type = 'Accident'
    and nullif(trim(sre.sa_employee_code), '') is not null
)
update public.bodyshop_repair_cards brc
set
  sa_employee_code = src.sa_employee_code,
  sa_name = coalesce(src.sa_name, brc.sa_name),
  updated_at = now()
from source_reception src
where brc.reception_entry_id = src.reception_entry_id
  and (
    coalesce(trim(brc.sa_employee_code), '') <> coalesce(trim(src.sa_employee_code), '')
    or coalesce(trim(brc.sa_name), '') <> coalesce(trim(src.sa_name), '')
  );

commit;
