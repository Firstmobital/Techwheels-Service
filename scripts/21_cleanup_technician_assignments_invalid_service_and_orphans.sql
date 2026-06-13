-- Cleanup technician_assignments rows that should not exist in Floor Incharge.
-- Rule: If matching reception entry has service_type in ('Accident', 'PDI'), delete assignment.

begin;

-- Preview what will be deleted.
with normalized_assignments as (
  select
    ta.id,
    ta.job_card_number,
    upper(btrim(coalesce(ta.job_card_number, ''))) as jc_norm,
    nullif(substring(upper(btrim(coalesce(ta.job_card_number, ''))) from '^RECEPTION-([0-9]+)$'), '')::bigint as reception_id_from_legacy
  from public.technician_assignments ta
),
normalized_reception as (
  select
    sre.id as reception_id,
    sre.jc_number,
    sre.service_type,
    upper(btrim(coalesce(sre.jc_number, ''))) as jc_norm,
    lower(btrim(coalesce(sre.service_type, ''))) as service_type_norm
  from public.service_reception_entries sre
),
rows_to_delete as (
  select
    na.id,
    na.job_card_number,
    nr.reception_id,
    nr.jc_number as reception_jc_number,
    nr.service_type as reception_service_type,
    'invalid_service_type_for_floor' as delete_reason
  from normalized_assignments na
  join normalized_reception nr
    on nr.jc_norm = na.jc_norm
    or (na.reception_id_from_legacy is not null and nr.reception_id = na.reception_id_from_legacy)
  where nr.service_type_norm in ('accident', 'pdi')
)
select
  id,
  job_card_number,
  reception_id,
  reception_jc_number,
  reception_service_type,
  delete_reason
from rows_to_delete
order by delete_reason, id;

-- Apply delete.
with normalized_assignments as (
  select
    ta.id,
    upper(btrim(coalesce(ta.job_card_number, ''))) as jc_norm,
    nullif(substring(upper(btrim(coalesce(ta.job_card_number, ''))) from '^RECEPTION-([0-9]+)$'), '')::bigint as reception_id_from_legacy
  from public.technician_assignments ta
),
normalized_reception as (
  select
    sre.id as reception_id,
    upper(btrim(coalesce(sre.jc_number, ''))) as jc_norm,
    lower(btrim(coalesce(sre.service_type, ''))) as service_type_norm
  from public.service_reception_entries sre
),
rows_to_delete as (
  select na.id
  from normalized_assignments na
  join normalized_reception nr
    on nr.jc_norm = na.jc_norm
    or (na.reception_id_from_legacy is not null and nr.reception_id = na.reception_id_from_legacy)
  where nr.service_type_norm in ('accident', 'pdi')
),
deleted as (
  delete from public.technician_assignments ta
  using rows_to_delete d
  where ta.id = d.id
  returning ta.id, ta.job_card_number
)
select * from deleted order by id;

-- Summary after delete.
select
  count(*) as remaining_accident_or_pdi_assignments
from public.technician_assignments ta
join public.service_reception_entries sre
  on upper(btrim(coalesce(sre.jc_number, ''))) = upper(btrim(coalesce(ta.job_card_number, '')))
  or (
    nullif(substring(upper(btrim(coalesce(ta.job_card_number, ''))) from '^RECEPTION-([0-9]+)$'), '')::bigint is not null
    and sre.id = nullif(substring(upper(btrim(coalesce(ta.job_card_number, ''))) from '^RECEPTION-([0-9]+)$'), '')::bigint
  )
where lower(btrim(coalesce(sre.service_type, ''))) in ('accident', 'pdi');

commit;
