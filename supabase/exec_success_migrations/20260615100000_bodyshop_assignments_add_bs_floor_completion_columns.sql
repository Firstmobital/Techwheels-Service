-- Add explicit Stage 11 parent completion marker for Bodyshop Floor.
alter table public.bodyshop_assignments
  add column if not exists bs_floor_completed_at timestamptz,
  add column if not exists bs_floor_completed_by text;

comment on column public.bodyshop_assignments.bs_floor_completed_at is
  'Timestamp when Bodyshop Floor parent stage (Stage 11) is explicitly marked complete.';

comment on column public.bodyshop_assignments.bs_floor_completed_by is
  'Actor (email/user id) who explicitly marked Bodyshop Floor parent stage complete.';
