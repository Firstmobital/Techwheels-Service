-- Migration: Add Floor Incharge stage columns and harden technician_assignments access
-- Purpose:
-- 1) Add Floor Incharge workflow fields: bay_no, status, out_ts, time_diff, remark.
-- 2) Keep IN TS mapped to existing assigned_at (already auto-captured).
-- 3) Auto-set out_ts when status becomes completed.
-- 4) Replace permissive technician_assignments RLS with floor_incharge module action semantics.
-- Date: 2026-06-01

BEGIN;

-- Add workflow columns
ALTER TABLE public.technician_assignments
  ADD COLUMN IF NOT EXISTS bay_no text,
  ADD COLUMN IF NOT EXISTS work_status text NOT NULL DEFAULT 'work_inprocess',
  ADD COLUMN IF NOT EXISTS out_ts timestamptz,
  ADD COLUMN IF NOT EXISTS remark text;

-- Auto-calculated duration from IN TS (assigned_at) to OUT TS.
ALTER TABLE public.technician_assignments
  ADD COLUMN IF NOT EXISTS time_diff interval
  GENERATED ALWAYS AS (
    CASE
      WHEN out_ts IS NULL THEN NULL
      ELSE out_ts - assigned_at
    END
  ) STORED;

-- Value constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'technician_assignments_work_status_check'
      AND conrelid = 'public.technician_assignments'::regclass
  ) THEN
    ALTER TABLE public.technician_assignments
      ADD CONSTRAINT technician_assignments_work_status_check
      CHECK (lower(btrim(work_status)) IN ('work_inprocess', 'hold', 'completed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'technician_assignments_bay_no_format_check'
      AND conrelid = 'public.technician_assignments'::regclass
  ) THEN
    ALTER TABLE public.technician_assignments
      ADD CONSTRAINT technician_assignments_bay_no_format_check
      CHECK (
        bay_no IS NULL
        OR upper(btrim(bay_no)) ~ '^(PV|EV)-(?:[1-9]|1[0-5])$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'technician_assignments_out_ts_status_check'
      AND conrelid = 'public.technician_assignments'::regclass
  ) THEN
    ALTER TABLE public.technician_assignments
      ADD CONSTRAINT technician_assignments_out_ts_status_check
      CHECK (
        (lower(btrim(work_status)) = 'completed' AND out_ts IS NOT NULL)
        OR (lower(btrim(work_status)) <> 'completed' AND out_ts IS NULL)
      );
  END IF;
END $$;

-- Auto-set OUT TS when status transitions to completed.
CREATE OR REPLACE FUNCTION public.sync_technician_assignment_out_ts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.work_status := lower(btrim(coalesce(NEW.work_status, 'work_inprocess')));

  IF NEW.work_status = 'completed' THEN
    IF NEW.out_ts IS NULL THEN
      NEW.out_ts := now();
    END IF;
  ELSE
    NEW.out_ts := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_technician_assignments_out_ts_sync ON public.technician_assignments;
CREATE TRIGGER trg_technician_assignments_out_ts_sync
  BEFORE INSERT OR UPDATE ON public.technician_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_technician_assignment_out_ts();

-- Keep updated_at current on updates.
DROP TRIGGER IF EXISTS trg_technician_assignments_updated_at ON public.technician_assignments;
CREATE TRIGGER trg_technician_assignments_updated_at
  BEFORE UPDATE ON public.technician_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Query helper indexes
CREATE INDEX IF NOT EXISTS idx_technician_assignments_status
  ON public.technician_assignments (work_status);

CREATE INDEX IF NOT EXISTS idx_technician_assignments_bay_no
  ON public.technician_assignments (bay_no);

CREATE INDEX IF NOT EXISTS idx_technician_assignments_assigned_at
  ON public.technician_assignments (assigned_at DESC);

-- Replace permissive policies with floor_incharge module semantics.
DROP POLICY IF EXISTS allow_all_authenticated ON public.technician_assignments;
DROP POLICY IF EXISTS authenticated_all ON public.technician_assignments;
DROP POLICY IF EXISTS technician_assignments_select_rbac ON public.technician_assignments;
DROP POLICY IF EXISTS technician_assignments_insert_rbac ON public.technician_assignments;
DROP POLICY IF EXISTS technician_assignments_update_rbac ON public.technician_assignments;
DROP POLICY IF EXISTS technician_assignments_delete_rbac ON public.technician_assignments;

CREATE POLICY technician_assignments_select_rbac ON public.technician_assignments
  FOR SELECT TO authenticated
  USING (public.has_module_view('floor_incharge'));

CREATE POLICY technician_assignments_insert_rbac ON public.technician_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.has_module_modify('floor_incharge'));

CREATE POLICY technician_assignments_update_rbac ON public.technician_assignments
  FOR UPDATE TO authenticated
  USING (public.has_module_modify('floor_incharge'))
  WITH CHECK (public.has_module_modify('floor_incharge'));

CREATE POLICY technician_assignments_delete_rbac ON public.technician_assignments
  FOR DELETE TO authenticated
  USING (public.has_module_delete('floor_incharge'));

COMMENT ON COLUMN public.technician_assignments.assigned_at IS
  'IN TS for floor-incharge workflow. Automatically captured at assignment time.';

COMMENT ON COLUMN public.technician_assignments.bay_no IS
  'Bay selection in PV/EV range format (PV-1..15, EV-1..15).';

COMMENT ON COLUMN public.technician_assignments.work_status IS
  'Floor-incharge workflow status: work_inprocess | hold | completed.';

COMMENT ON COLUMN public.technician_assignments.out_ts IS
  'OUT TS. Auto-captured when work_status changes to completed.';

COMMENT ON COLUMN public.technician_assignments.time_diff IS
  'Auto-calculated duration between IN TS (assigned_at) and OUT TS.';

COMMENT ON COLUMN public.technician_assignments.remark IS
  'Floor-incharge stage remark.';

COMMIT;
