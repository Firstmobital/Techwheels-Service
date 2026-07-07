-- Add Parts Incharge role to bodyshop_assignments table
-- and update bodyshop_floor_support_assignments check constraint

-- ── 1. Add parts_incharge columns to bodyshop_assignments ────────────────────

ALTER TABLE public.bodyshop_assignments
  ADD COLUMN IF NOT EXISTS parts_incharge_employee_code  text,
  ADD COLUMN IF NOT EXISTS parts_incharge_employee_name  text,
  ADD COLUMN IF NOT EXISTS parts_incharge_work_status    text,
  ADD COLUMN IF NOT EXISTS parts_incharge_in_ts          timestamptz,
  ADD COLUMN IF NOT EXISTS parts_incharge_remark         text,
  ADD COLUMN IF NOT EXISTS parts_incharge_out_ts         timestamptz,
  ADD COLUMN IF NOT EXISTS parts_incharge_completed_by   text;

-- ── 2. Update bodyshop_floor_support_assignments check constraint ─────────────
-- (Parts Incharge has no support staff but keeping constraint consistent)

ALTER TABLE public.bodyshop_floor_support_assignments
  DROP CONSTRAINT bodyshop_floor_support_assignments_support_role_check;

ALTER TABLE public.bodyshop_floor_support_assignments
  ADD CONSTRAINT bodyshop_floor_support_assignments_support_role_check
    CHECK (upper(btrim(support_role)) = ANY (ARRAY[
      'DENTOR'::text,
      'PAINTER'::text,
      'TECHNICIAN'::text,
      'FLOOR_INCHARGE'::text,
      'DENTOR_HELPER'::text,
      'PAINTER_HELPER'::text,
      'RUBBING'::text,
      'EDP'::text,
      'PARTS_INCHARGE'::text
    ]));
