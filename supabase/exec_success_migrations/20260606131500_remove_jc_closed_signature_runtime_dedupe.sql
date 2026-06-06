-- Cutover JC Closed import dedupe to DB unique-key + upsert.
-- Removes trigger/function/signature table runtime dependency.

BEGIN;

-- 1) Ensure business-key uniqueness exists for upsert conflict handling.
CREATE UNIQUE INDEX IF NOT EXISTS uq_jc_closed_branch_job_card_number
ON public.job_card_closed_data (branch, job_card_number)
WHERE job_card_number IS NOT NULL
  AND btrim(job_card_number) <> '';

-- 2) Remove trigger-based signature dedupe path.
DROP TRIGGER IF EXISTS trg_jc_closed_dedupe_and_merge ON public.job_card_closed_data;
DROP FUNCTION IF EXISTS public.fn_jc_closed_dedupe_and_merge();

-- 3) Drop signature registry table (no longer needed at runtime).
DROP TABLE IF EXISTS public.job_card_closed_data_import_signatures;

COMMIT;
