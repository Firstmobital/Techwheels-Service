-- Bodyshop Floor support assignments: rename SUPERVISOR → FLOOR_INCHARGE,
-- add RUBBING and EDP to allowed support roles.

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
      'EDP'::text
    ]));

-- Rename any existing SUPERVISOR rows to FLOOR_INCHARGE
UPDATE public.bodyshop_floor_support_assignments
  SET support_role = 'FLOOR_INCHARGE'
  WHERE upper(btrim(support_role)) = 'SUPERVISOR';
