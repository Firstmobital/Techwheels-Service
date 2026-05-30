-- Add rote column to employee master for role-like tagging and dropdown usage.
alter table if exists public.employee_master
  add column if not exists rote text;

comment on column public.employee_master.rote is 'Rote label for employee assignment, RBAC mapping, and dropdown filtering.';
