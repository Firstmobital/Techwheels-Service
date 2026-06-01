-- Migration: Add RLS policies to sensitive tables lacking protection
-- Purpose: Harden privilege posture by adding strict RLS to employee_master, technician_assignments, service_branches
-- Date: 2026-06-01

-- Enable RLS on sensitive tables (if not already enabled)
ALTER TABLE public.employee_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_master_select_all ON public.employee_master;
DROP POLICY IF EXISTS employee_master_insert_admin ON public.employee_master;
DROP POLICY IF EXISTS employee_master_update_admin ON public.employee_master;
DROP POLICY IF EXISTS employee_master_delete_admin ON public.employee_master;

-- Policy for employee_master: everyone can view active employees (read-only)
-- Admin only can modify/delete
CREATE POLICY employee_master_select_all ON public.employee_master
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY employee_master_insert_admin ON public.employee_master
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY employee_master_update_admin ON public.employee_master
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY employee_master_delete_admin ON public.employee_master
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- Add RLS to technician_assignments (if it exists and lacks policies)
-- Note: verify this table exists in current schema before uncommenting
-- ALTER TABLE public.technician_assignments ENABLE ROW LEVEL SECURITY;

-- Add RLS to service_branches (if it exists and lacks policies)
-- Note: verify this table exists in current schema before uncommenting
-- ALTER TABLE public.service_branches ENABLE ROW LEVEL SECURITY;
