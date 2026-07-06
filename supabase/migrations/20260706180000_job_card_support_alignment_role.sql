-- Add ALIGNMENT to job_card_support_assignments CHECK constraint
--
-- Context: Floor Incharge page added a new "Alignment" support role option.
-- The existing CHECK constraint only allows:
--   DET, ELECTRICIAN, DENTER, DENTOR, TECHNICIAN
-- Saving an ALIGNMENT assignment would fail at the DB level without this change.
--
-- Verified constraint name from dump:
--   job_card_support_assignments_support_role_check

ALTER TABLE public.job_card_support_assignments
  DROP CONSTRAINT job_card_support_assignments_support_role_check;

ALTER TABLE public.job_card_support_assignments
  ADD CONSTRAINT job_card_support_assignments_support_role_check
    CHECK (
      upper(btrim(support_role)) = ANY (
        ARRAY[
          'DET'::text,
          'ELECTRICIAN'::text,
          'DENTER'::text,
          'DENTOR'::text,
          'TECHNICIAN'::text,
          'ALIGNMENT'::text
        ]
      )
    );

COMMENT ON COLUMN public.job_card_support_assignments.support_role IS
  'Support role: DET, ELECTRICIAN, DENTOR (legacy DENTER accepted), TECHNICIAN, or ALIGNMENT. Multiple people per job card allowed.';
