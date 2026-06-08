BEGIN;

DO $$
DECLARE
  duplicate_jc_count integer;
BEGIN
  SELECT count(*)
  INTO duplicate_jc_count
  FROM (
    SELECT upper(btrim(jc_number)) AS jc_number_norm
    FROM public.service_reception_entries
    WHERE nullif(btrim(jc_number), '') IS NOT NULL
    GROUP BY upper(btrim(jc_number))
    HAVING count(*) > 1
  ) d;

  IF duplicate_jc_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce unique JC number on service_reception_entries: % duplicate normalized JC values still exist. Fix duplicates first, then rerun migration.',
      duplicate_jc_count;
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.uq_service_reception_entries_dealer_jc_number_norm;

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_reception_entries_jc_number_norm
  ON public.service_reception_entries (upper(btrim(jc_number)))
  WHERE nullif(btrim(jc_number), '') IS NOT NULL;

COMMIT;