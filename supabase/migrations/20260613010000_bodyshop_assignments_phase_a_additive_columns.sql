-- Phase A: Additive schema for one-row-per-job-card model in public.bodyshop_assignments
-- Safe: additive only, no destructive changes.

begin;

alter table public.bodyshop_assignments
  add column if not exists dentor_employee_code text,
  add column if not exists dentor_employee_name text,
  add column if not exists painter_employee_code text,
  add column if not exists painter_employee_name text,
  add column if not exists technician_employee_code text,
  add column if not exists technician_employee_name text,
  add column if not exists electrician_employee_code text,
  add column if not exists electrician_employee_name text,
  add column if not exists det_employee_code text,
  add column if not exists det_employee_name text,
  add column if not exists dentor_work_status text,
  add column if not exists dentor_remark text,
  add column if not exists dentor_out_ts timestamp with time zone,
  add column if not exists painter_work_status text,
  add column if not exists painter_remark text,
  add column if not exists painter_out_ts timestamp with time zone,
  add column if not exists technician_work_status text,
  add column if not exists technician_remark text,
  add column if not exists technician_out_ts timestamp with time zone,
  add column if not exists electrician_work_status text,
  add column if not exists electrician_remark text,
  add column if not exists electrician_out_ts timestamp with time zone,
  add column if not exists det_work_status text,
  add column if not exists det_remark text,
  add column if not exists det_out_ts timestamp with time zone;

-- Stage-status validation checks for new role-wise status columns.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bodyshop_assignments_dentor_work_status_check'
  ) then
    alter table public.bodyshop_assignments
      add constraint bodyshop_assignments_dentor_work_status_check
      check (
        dentor_work_status is null
        or dentor_work_status = any (array['work_inprocess'::text, 'hold'::text, 'completed'::text])
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'bodyshop_assignments_painter_work_status_check'
  ) then
    alter table public.bodyshop_assignments
      add constraint bodyshop_assignments_painter_work_status_check
      check (
        painter_work_status is null
        or painter_work_status = any (array['work_inprocess'::text, 'hold'::text, 'completed'::text])
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'bodyshop_assignments_technician_work_status_check'
  ) then
    alter table public.bodyshop_assignments
      add constraint bodyshop_assignments_technician_work_status_check
      check (
        technician_work_status is null
        or technician_work_status = any (array['work_inprocess'::text, 'hold'::text, 'completed'::text])
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'bodyshop_assignments_electrician_work_status_check'
  ) then
    alter table public.bodyshop_assignments
      add constraint bodyshop_assignments_electrician_work_status_check
      check (
        electrician_work_status is null
        or electrician_work_status = any (array['work_inprocess'::text, 'hold'::text, 'completed'::text])
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'bodyshop_assignments_det_work_status_check'
  ) then
    alter table public.bodyshop_assignments
      add constraint bodyshop_assignments_det_work_status_check
      check (
        det_work_status is null
        or det_work_status = any (array['work_inprocess'::text, 'hold'::text, 'completed'::text])
      );
  end if;
end $$;

comment on column public.bodyshop_assignments.dentor_employee_code is 'Primary dentor assignee code for one-row-per-job-card model.';
comment on column public.bodyshop_assignments.painter_employee_code is 'Primary painter assignee code for one-row-per-job-card model.';
comment on column public.bodyshop_assignments.technician_employee_code is 'Primary technician assignee code for one-row-per-job-card model.';
comment on column public.bodyshop_assignments.electrician_employee_code is 'Primary electrician assignee code for one-row-per-job-card model.';
comment on column public.bodyshop_assignments.det_employee_code is 'Primary DET assignee code for one-row-per-job-card model.';

commit;
