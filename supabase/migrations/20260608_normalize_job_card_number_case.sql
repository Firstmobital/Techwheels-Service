-- 2026-06-08: Normalize job_card_number to uppercase across all tables
-- Issue: Case-sensitive mismatches causing failed joins and missing data
-- Example: "JC-MBTPLT-JP1-2627-002878" != "JC-MbtPlt-JP1-2627-002878"
-- Impact: Technician earnings were showing $0 due to failed revenue data lookup

BEGIN;

-- Strategy: For job_card_closed_data with composite unique constraint (branch, job_card_number, invoice_date),
-- we need to handle duplicates by keeping the one with the latest closed_date_time (most recent)

-- 1. First, identify and delete duplicate records in job_card_closed_data
-- Keep only the record with the latest closed_date_time for each (branch, normalized_jc, invoice_date)
DELETE FROM public.job_card_closed_data
WHERE id IN (
  SELECT id FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY 
          branch,
          UPPER(BTRIM(COALESCE(job_card_number, ''))),
          invoice_date
        ORDER BY COALESCE(closed_date_time, invoice_date) DESC NULLS LAST, id DESC
      ) as rn
    FROM public.job_card_closed_data
    WHERE job_card_number IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- 2. Now we can safely normalize job_card_closed_data without constraint violations
UPDATE public.job_card_closed_data
SET job_card_number = UPPER(BTRIM(job_card_number))
WHERE job_card_number IS NOT NULL AND job_card_number != UPPER(BTRIM(job_card_number));

-- 3. Normalize technician_assignments (drop constraint if needed)
ALTER TABLE public.technician_assignments DROP CONSTRAINT IF EXISTS technician_assignments_job_card_number_key;

UPDATE public.technician_assignments
SET job_card_number = UPPER(BTRIM(job_card_number))
WHERE job_card_number IS NOT NULL AND job_card_number != UPPER(BTRIM(job_card_number));

-- 4. Normalize service_reception_entries (jc_number field)
UPDATE public.service_reception_entries
SET jc_number = UPPER(BTRIM(jc_number))
WHERE jc_number IS NOT NULL AND jc_number != UPPER(BTRIM(jc_number));

-- 5. Normalize service_vas_jc_data (job_card_number field if it exists)
UPDATE public.service_vas_jc_data
SET job_card_number = UPPER(BTRIM(job_card_number))
WHERE job_card_number IS NOT NULL AND job_card_number != UPPER(BTRIM(job_card_number));

-- 6. Create trigger function to normalize on INSERT/UPDATE for job_card_number
CREATE OR REPLACE FUNCTION public.normalize_job_card_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.job_card_number IS NOT NULL THEN
    NEW.job_card_number := UPPER(BTRIM(NEW.job_card_number));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Add triggers to tables if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_normalize_technician_assignments_jc'
  ) THEN
    CREATE TRIGGER trg_normalize_technician_assignments_jc
    BEFORE INSERT OR UPDATE ON public.technician_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.normalize_job_card_number();
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_normalize_job_card_closed_data_jc'
  ) THEN
    CREATE TRIGGER trg_normalize_job_card_closed_data_jc
    BEFORE INSERT OR UPDATE ON public.job_card_closed_data
    FOR EACH ROW
    EXECUTE FUNCTION public.normalize_job_card_number();
  END IF;
END
$$;

-- 8. Create trigger for service_reception_entries and service_vas_jc_data
CREATE OR REPLACE FUNCTION public.normalize_jc_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.jc_number IS NOT NULL THEN
    NEW.jc_number := UPPER(BTRIM(NEW.jc_number));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.normalize_vas_job_card_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.job_card_number IS NOT NULL THEN
    NEW.job_card_number := UPPER(BTRIM(NEW.job_card_number));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_normalize_service_reception_jc'
  ) THEN
    CREATE TRIGGER trg_normalize_service_reception_jc
    BEFORE INSERT OR UPDATE ON public.service_reception_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.normalize_jc_number();
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_normalize_service_vas_jc_data_jc'
  ) THEN
    CREATE TRIGGER trg_normalize_service_vas_jc_data_jc
    BEFORE INSERT OR UPDATE ON public.service_vas_jc_data
    FOR EACH ROW
    EXECUTE FUNCTION public.normalize_vas_job_card_number();
  END IF;
END
$$;

-- 9. Create helper functions for case-insensitive queries
-- Function to get revenue data with case-insensitive matching
CREATE OR REPLACE FUNCTION public.get_revenue_by_jc_case_insensitive(p_jc_numbers TEXT[])
RETURNS TABLE (
  job_card_number TEXT,
  closed_date_time TIMESTAMP,
  invoice_date TIMESTAMP,
  final_labour_amount NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.job_card_number,
    j.closed_date_time,
    j.invoice_date,
    j.final_labour_amount
  FROM public.job_card_closed_data j
  WHERE UPPER(BTRIM(COALESCE(j.job_card_number, ''))) = ANY(
    SELECT UPPER(BTRIM(v)) FROM UNNEST(p_jc_numbers) AS t(v)
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get reception data with case-insensitive matching
CREATE OR REPLACE FUNCTION public.get_reception_by_jc_case_insensitive(p_jc_numbers TEXT[])
RETURNS TABLE (
  jc_number TEXT,
  reg_number TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.jc_number,
    s.reg_number
  FROM public.service_reception_entries s
  WHERE UPPER(BTRIM(COALESCE(s.jc_number, ''))) = ANY(
    SELECT UPPER(BTRIM(v)) FROM UNNEST(p_jc_numbers) AS t(v)
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMIT;
