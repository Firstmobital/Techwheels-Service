-- Fix: PSF import shows success but job_card_closed_data remains empty.
-- Cause: stale rows in job_card_closed_data_import_signatures can make trigger
-- fn_jc_closed_dedupe_and_merge skip every insert (RETURN NULL).

BEGIN;

-- 1) Clear stale dedupe signatures.
TRUNCATE TABLE public.job_card_closed_data_import_signatures;

-- 2) Re-seed signatures from rows that actually exist now.
INSERT INTO public.job_card_closed_data_import_signatures (signature)
SELECT DISTINCT
  md5(
    coalesce(branch, '') || '|' ||
    coalesce(invoice_date::text, '') || '|' ||
    upper(trim(coalesce(job_card_number, ''))) || '|' ||
    upper(trim(coalesce(chassis_number, ''))) || '|' ||
    coalesce(final_labour_amount, 0)::text || '|' ||
    coalesce(final_spares_amount, 0)::text || '|' ||
    coalesce(total_invoice_amount, 0)::text
  )
FROM public.job_card_closed_data
ON CONFLICT (signature) DO NOTHING;

COMMIT;

-- Optional verification
-- SELECT COUNT(*) AS jc_rows FROM public.job_card_closed_data;
-- SELECT COUNT(*) AS signature_rows FROM public.job_card_closed_data_import_signatures;
