-- Purpose:
-- Add robot-update audit columns on public.all_service_data.
-- 1) updated_by_robot: boolean flag for automation-touched rows.
-- 2) updated_by_robot_at: timestamp when automation updated the row.
--
-- Notes:
-- PostgreSQL boolean input already supports true/false variants including
-- TRUE/FALSE, t/f, yes/no, on/off, and 1/0.

BEGIN;

ALTER TABLE public.all_service_data
  ADD COLUMN IF NOT EXISTS updated_by_robot boolean,
  ADD COLUMN IF NOT EXISTS updated_by_robot_at timestamptz;

COMMENT ON COLUMN public.all_service_data.updated_by_robot
IS 'Robot update flag. PostgreSQL boolean input supports true/false, t/f, yes/no, on/off, 1/0.';

COMMENT ON COLUMN public.all_service_data.updated_by_robot_at
IS 'Timestamp with time zone when robot automation last updated this row.';

COMMIT;
