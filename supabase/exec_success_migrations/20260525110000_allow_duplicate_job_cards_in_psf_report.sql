-- Allow duplicate job cards in PSF Revenue Report imports.
-- Some duplicate job card rows carry additional labour/spares values and must be preserved.

ALTER TABLE public.job_card_closed_data
  DROP CONSTRAINT IF EXISTS job_card_closed_data_job_card_number_branch_key;

ALTER TABLE public.job_card_closed_data
  DROP CONSTRAINT IF EXISTS job_card_closed_data_job_card_number_key;

DROP INDEX IF EXISTS public.job_card_closed_data_job_card_number_branch_key;
DROP INDEX IF EXISTS public.job_card_closed_data_job_card_number_key;
