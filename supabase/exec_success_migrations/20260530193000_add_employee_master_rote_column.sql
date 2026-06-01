-- Add role column to employee master for role assignment, RBAC mapping, and dropdown usage.
alter table if exists public.employee_master
  add column if not exists role text;

comment on column public.employee_master.role is 'Role label for employee assignment, RBAC mapping, and dropdown filtering.';
