-- Enforce one technician_assignments row per job card (long-term duplicate guard)
-- 1) Normalize existing job_card_number values.
-- 2) Archive and remove legacy duplicates (keep latest row per job card).
-- 3) Add durable uniqueness guard.

-- Normalize existing keys to match trigger behavior and avoid case/space duplicates.
update public.technician_assignments
set job_card_number = upper(btrim(job_card_number))
where job_card_number is not null
  and job_card_number <> upper(btrim(job_card_number));

-- Keep an audit trail of rows removed by de-duplication.
create table if not exists public.technician_assignments_dedup_backup as
select
  ta.*,
  now()::timestamptz as deduped_at,
  ''::text as dedupe_reason
from public.technician_assignments ta
where false;

with ranked as (
  select
    ta.id,
    ta.job_card_number,
    row_number() over (
      partition by upper(btrim(ta.job_card_number))
      order by coalesce(ta.updated_at, ta.out_ts, ta.assigned_at, ta.created_at) desc, ta.id desc
    ) as rn
  from public.technician_assignments ta
),
rows_to_remove as (
  select ta.*
  from public.technician_assignments ta
  join ranked r on r.id = ta.id
  where r.rn > 1
),
archived as (
  insert into public.technician_assignments_dedup_backup
  select
    rtr.*,
    now()::timestamptz as deduped_at,
    'migration: enforce single row per job_card_number'::text as dedupe_reason
  from rows_to_remove rtr
  returning id
)
delete from public.technician_assignments ta
using ranked r
where ta.id = r.id
  and r.rn > 1;

-- Ensure job card number is always present and not blank.
alter table public.technician_assignments
  add constraint technician_assignments_job_card_number_nonempty
  check (btrim(job_card_number) <> '');

-- Permanent guard: one row per normalized job card number.
create unique index if not exists uq_technician_assignments_job_card_key
  on public.technician_assignments (upper(btrim(job_card_number)));

comment on index public.uq_technician_assignments_job_card_key is
  'Prevents multiple technician assignment rows for the same job card.';
