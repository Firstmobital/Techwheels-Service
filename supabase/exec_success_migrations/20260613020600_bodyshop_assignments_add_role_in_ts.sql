-- Add role-wise IN timestamps for one-row-per-job-card primary model
-- Migration-safe: additive columns + backfill only

begin;

alter table public.bodyshop_assignments
  add column if not exists dentor_in_ts timestamp with time zone,
  add column if not exists painter_in_ts timestamp with time zone,
  add column if not exists technician_in_ts timestamp with time zone,
  add column if not exists electrician_in_ts timestamp with time zone,
  add column if not exists det_in_ts timestamp with time zone;

-- Backfill from existing assigned_at where role is present and role in_ts is null.
update public.bodyshop_assignments
set dentor_in_ts = assigned_at
where dentor_employee_code is not null
  and dentor_in_ts is null;

update public.bodyshop_assignments
set painter_in_ts = assigned_at
where painter_employee_code is not null
  and painter_in_ts is null;

update public.bodyshop_assignments
set technician_in_ts = assigned_at
where technician_employee_code is not null
  and technician_in_ts is null;

update public.bodyshop_assignments
set electrician_in_ts = assigned_at
where electrician_employee_code is not null
  and electrician_in_ts is null;

update public.bodyshop_assignments
set det_in_ts = assigned_at
where det_employee_code is not null
  and det_in_ts is null;

comment on column public.bodyshop_assignments.dentor_in_ts is 'Role-specific IN timestamp for Dentor primary assignment.';
comment on column public.bodyshop_assignments.painter_in_ts is 'Role-specific IN timestamp for Painter primary assignment.';
comment on column public.bodyshop_assignments.technician_in_ts is 'Role-specific IN timestamp for Technician primary assignment.';
comment on column public.bodyshop_assignments.electrician_in_ts is 'Role-specific IN timestamp for Electrician primary assignment.';
comment on column public.bodyshop_assignments.det_in_ts is 'Role-specific IN timestamp for DET primary assignment.';

commit;
