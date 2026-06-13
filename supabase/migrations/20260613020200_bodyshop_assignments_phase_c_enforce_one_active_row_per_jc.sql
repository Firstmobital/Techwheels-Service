-- Phase C: Enforce one active primary row per job card
-- Uses partial unique index to allow inactive history rows.

-- Precheck active duplicates before creating unique index.
do $$
declare
  dup_count integer;
begin
  select count(*) into dup_count
  from (
    select upper(btrim(job_card_number)) as jc_key
    from public.bodyshop_assignments
    where coalesce(is_active, true) = true
      and btrim(job_card_number) <> ''
    group by upper(btrim(job_card_number))
    having count(*) > 1
  ) d;

  if dup_count > 0 then
    raise exception 'Cannot enforce unique active job_card_number. Found % duplicate active job cards in bodyshop_assignments.', dup_count;
  end if;
end $$;

create unique index if not exists uq_bodyshop_assignments_active_job_card
  on public.bodyshop_assignments (upper(btrim(job_card_number)))
  where is_active = true;

comment on index public.uq_bodyshop_assignments_active_job_card is
  'Ensures one active primary row per job card in bodyshop_assignments.';
