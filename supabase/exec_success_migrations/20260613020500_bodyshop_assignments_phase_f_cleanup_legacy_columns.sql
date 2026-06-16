-- Phase F: Final cleanup after app fully switches to one-row-per-job-card columns
-- WARNING: Run only after validating all reads/writes use role-specific columns.

begin;

drop trigger if exists trg_bodyshop_assignments_legacy_insert_bridge on public.bodyshop_assignments;
drop function if exists public.bodyshop_assignments_legacy_insert_bridge();

-- Drop legacy row-per-role constraints first.
alter table public.bodyshop_assignments
  drop constraint if exists bodyshop_assignments_role_check,
  drop constraint if exists bodyshop_assignments_work_status_check;

-- Drop legacy row-per-role columns.
alter table public.bodyshop_assignments
  drop column if exists role,
  drop column if exists employee_code,
  drop column if exists employee_name,
  drop column if exists work_status,
  drop column if exists remark,
  drop column if exists out_ts;

commit;
