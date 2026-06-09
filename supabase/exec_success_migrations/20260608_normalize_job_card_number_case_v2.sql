-- 2026-06-08 v2: Fix job_card_number normalization (safer approach)
-- Previous migration may have had constraint issues - this ensures all data is normalized

BEGIN;

-- 1. Normalize technician_assignments directly (safer - no constraint drops)
UPDATE public.technician_assignments
SET job_card_number = UPPER(BTRIM(COALESCE(job_card_number, '')))
WHERE job_card_number IS NOT NULL AND job_card_number != UPPER(BTRIM(job_card_number));

-- 2. Normalize job_card_closed_data (if any remain unnormalized)
UPDATE public.job_card_closed_data
SET job_card_number = UPPER(BTRIM(COALESCE(job_card_number, '')))
WHERE job_card_number IS NOT NULL AND job_card_number != UPPER(BTRIM(job_card_number));

-- 3. Normalize service_reception_entries
UPDATE public.service_reception_entries
SET jc_number = UPPER(BTRIM(COALESCE(jc_number, '')))
WHERE jc_number IS NOT NULL AND jc_number != UPPER(BTRIM(jc_number));

-- 4. Normalize service_vas_jc_data
UPDATE public.service_vas_jc_data
SET job_card_number = UPPER(BTRIM(COALESCE(job_card_number, '')))
WHERE job_card_number IS NOT NULL AND job_card_number != UPPER(BTRIM(job_card_number));

-- 5. Create or replace normalization functions
CREATE OR REPLACE FUNCTION public.normalize_job_card_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.job_card_number IS NOT NULL THEN
    NEW.job_card_number := UPPER(BTRIM(NEW.job_card_number));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.normalize_jc_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.jc_number IS NOT NULL THEN
    NEW.jc_number := UPPER(BTRIM(NEW.jc_number));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Drop existing triggers before recreating (idempotent)
DROP TRIGGER IF EXISTS trg_normalize_technician_assignments_jc ON public.technician_assignments;
DROP TRIGGER IF EXISTS trg_normalize_job_card_closed_data_jc ON public.job_card_closed_data;
DROP TRIGGER IF EXISTS trg_normalize_service_reception_jc ON public.service_reception_entries;
DROP TRIGGER IF EXISTS trg_normalize_service_vas_jc_data_jc ON public.service_vas_jc_data;

-- 7. Create new triggers to auto-normalize on INSERT/UPDATE
CREATE TRIGGER trg_normalize_technician_assignments_jc
BEFORE INSERT OR UPDATE ON public.technician_assignments
FOR EACH ROW
EXECUTE FUNCTION public.normalize_job_card_number();

CREATE TRIGGER trg_normalize_job_card_closed_data_jc
BEFORE INSERT OR UPDATE ON public.job_card_closed_data
FOR EACH ROW
EXECUTE FUNCTION public.normalize_job_card_number();

CREATE TRIGGER trg_normalize_service_reception_jc
BEFORE INSERT OR UPDATE ON public.service_reception_entries
FOR EACH ROW
EXECUTE FUNCTION public.normalize_jc_number();

CREATE TRIGGER trg_normalize_service_vas_jc_data_jc
BEFORE INSERT OR UPDATE ON public.service_vas_jc_data
FOR EACH ROW
EXECUTE FUNCTION public.normalize_job_card_number();

COMMIT;
