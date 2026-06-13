-- Expand bodyshop_assignments role constraint to include ELECTRICIAN and DET
-- Purpose: Enable primary allocation for all 5 roles in Bodyshop Floor
-- Migration sequence: Apply this BEFORE 20260613000001_create_bodyshop_floor_support_assignments.sql

-- Drop existing role constraint (3 roles)
alter table public.bodyshop_assignments
  drop constraint bodyshop_assignments_role_check;

-- Add new role constraint (5 roles)
alter table public.bodyshop_assignments
  add constraint bodyshop_assignments_role_check
    check (role = any (array['DENTOR'::text, 'PAINTER'::text, 'TECHNICIAN'::text, 'ELECTRICIAN'::text, 'DET'::text]));

-- Verification
do $$
begin
  raise notice 'INFO: bodyshop_assignments.role constraint expanded to 5 roles (DENTOR, PAINTER, TECHNICIAN, ELECTRICIAN, DET)';
  raise notice 'PASS: Primary allocation now supports all 5 roles';
end $$;
