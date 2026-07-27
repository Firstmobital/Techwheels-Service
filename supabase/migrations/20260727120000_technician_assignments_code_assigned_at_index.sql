-- Speed up /technician tracker queries scoped by technician_code + assigned_at window.
-- Non-admin users filter on technician_code in PostgREST; this avoids full-table scans.

CREATE INDEX IF NOT EXISTS idx_technician_assignments_code_assigned_at
  ON public.technician_assignments (technician_code, assigned_at DESC);
