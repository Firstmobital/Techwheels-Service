-- Bodyshop Floor: update support role constraint
-- Removes ELECTRICIAN and DET, adds SUPERVISOR, DENTOR_HELPER, PAINTER_HELPER
-- to match the updated BodyshopFloorPage role set.
--
-- SAFETY CHECK: run this first to confirm no ELECTRICIAN/DET rows exist:
--   SELECT support_role, COUNT(*)
--   FROM public.bodyshop_floor_support_assignments
--   WHERE upper(btrim(support_role)) IN ('ELECTRICIAN', 'DET')
--   GROUP BY support_role;
-- Expected: 0 rows. If rows exist, handle them before applying.

ALTER TABLE public.bodyshop_floor_support_assignments
  DROP CONSTRAINT bodyshop_floor_support_assignments_support_role_check;

ALTER TABLE public.bodyshop_floor_support_assignments
  ADD CONSTRAINT bodyshop_floor_support_assignments_support_role_check
    CHECK (upper(btrim(support_role)) = ANY (ARRAY[
      'DENTOR'::text,
      'PAINTER'::text,
      'TECHNICIAN'::text,
      'SUPERVISOR'::text,
      'DENTOR_HELPER'::text,
      'PAINTER_HELPER'::text
    ]));
