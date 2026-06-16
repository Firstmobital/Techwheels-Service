-- Phase D: Keep support table multi-row while preventing exact active duplicates
-- Blocks duplicate active support rows for same job_card + support_role + employee_code.

do $$
declare
  dup_count integer;
begin
  select count(*) into dup_count
  from (
    select
      upper(btrim(job_card_number)) as jc_key,
      upper(btrim(support_role)) as role_key,
      upper(btrim(employee_code)) as emp_key
    from public.bodyshop_floor_support_assignments
    where coalesce(is_active, true) = true
      and btrim(job_card_number) <> ''
      and btrim(support_role) <> ''
      and btrim(employee_code) <> ''
    group by upper(btrim(job_card_number)), upper(btrim(support_role)), upper(btrim(employee_code))
    having count(*) > 1
  ) d;

  if dup_count > 0 then
    raise exception 'Cannot enforce support duplicate guard. Found % duplicate active support rows.', dup_count;
  end if;
end $$;

create unique index if not exists uq_bodyshop_floor_support_active_triplet
  on public.bodyshop_floor_support_assignments (
    upper(btrim(job_card_number)),
    upper(btrim(support_role)),
    upper(btrim(employee_code))
  )
  where is_active = true;

comment on index public.uq_bodyshop_floor_support_active_triplet is
  'Prevents duplicate active support assignment for same job card + role + employee.';
