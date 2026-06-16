-- Add role-wise completion actor fields for Stage 11 substage auditability
-- Migration-safe: additive columns + conservative backfill only

begin;

alter table public.bodyshop_assignments
  add column if not exists dentor_completed_by text,
  add column if not exists painter_completed_by text,
  add column if not exists technician_completed_by text,
  add column if not exists electrician_completed_by text,
  add column if not exists det_completed_by text;

-- Backfill completion actor from assigned_by for already-completed roles where actor is unknown.
update public.bodyshop_assignments
set dentor_completed_by = assigned_by
where dentor_work_status = 'completed'
  and dentor_completed_by is null
  and assigned_by is not null;

update public.bodyshop_assignments
set painter_completed_by = assigned_by
where painter_work_status = 'completed'
  and painter_completed_by is null
  and assigned_by is not null;

update public.bodyshop_assignments
set technician_completed_by = assigned_by
where technician_work_status = 'completed'
  and technician_completed_by is null
  and assigned_by is not null;

update public.bodyshop_assignments
set electrician_completed_by = assigned_by
where electrician_work_status = 'completed'
  and electrician_completed_by is null
  and assigned_by is not null;

update public.bodyshop_assignments
set det_completed_by = assigned_by
where det_work_status = 'completed'
  and det_completed_by is null
  and assigned_by is not null;

comment on column public.bodyshop_assignments.dentor_completed_by is 'Completion actor for Dentor role (Stage 11 substage workflow).';
comment on column public.bodyshop_assignments.painter_completed_by is 'Completion actor for Painter role (Stage 11 substage workflow).';
comment on column public.bodyshop_assignments.technician_completed_by is 'Completion actor for Technician role (Stage 11 substage workflow).';
comment on column public.bodyshop_assignments.electrician_completed_by is 'Completion actor for Electrician role (Stage 11 substage workflow).';
comment on column public.bodyshop_assignments.det_completed_by is 'Completion actor for DET role (Stage 11 substage workflow).';

commit;
