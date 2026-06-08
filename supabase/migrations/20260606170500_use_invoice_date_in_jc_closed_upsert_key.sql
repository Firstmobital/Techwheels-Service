-- Make JC Closed duplicate semantics use:
-- (branch, job_card_number, invoice_date)
-- so only same branch + same JC + same invoice_date is considered duplicate.

BEGIN;

-- Remove legacy guard trigger that merged on (branch, job_card_number)
-- and would incorrectly collapse different invoice_date rows.
DROP TRIGGER IF EXISTS trg_jc_closed_conflict_guard ON public.job_card_closed_data;
DROP FUNCTION IF EXISTS public.fn_jc_closed_conflict_guard();

-- Drop legacy and prior candidate indexes.
DROP INDEX IF EXISTS public.uq_jc_closed_branch_job_card_number;
DROP INDEX IF EXISTS public.uq_jc_closed_branch_job_card_number_invoice_date;
DROP INDEX IF EXISTS public.uq_jc_closed_branch_job_card_number_Invoice_date;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'job_card_closed_data'
      AND column_name = 'invoice_date'
  ) THEN
    EXECUTE '
      CREATE UNIQUE INDEX IF NOT EXISTS uq_jc_closed_branch_job_card_number_invoice_date
      ON public.job_card_closed_data (branch, job_card_number, invoice_date)
      WHERE job_card_number IS NOT NULL
        AND btrim(job_card_number) <> ''''
        AND invoice_date IS NOT NULL
    ';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'job_card_closed_data'
      AND column_name = 'Invoice_date'
  ) THEN
    EXECUTE '
      CREATE UNIQUE INDEX IF NOT EXISTS uq_jc_closed_branch_job_card_number_Invoice_date
      ON public.job_card_closed_data (branch, job_card_number, "Invoice_date")
      WHERE job_card_number IS NOT NULL
        AND btrim(job_card_number) <> ''''
        AND "Invoice_date" IS NOT NULL
    ';
  ELSE
    RAISE EXCEPTION ''Missing invoice date column on public.job_card_closed_data (expected invoice_date or "Invoice_date")'';
  END IF;
END
$$;

COMMIT;
