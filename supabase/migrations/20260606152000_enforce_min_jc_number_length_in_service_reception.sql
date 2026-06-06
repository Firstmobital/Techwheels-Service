BEGIN;

DO $$
DECLARE
  min_jc_len integer := char_length('JC-MBTPLT-JP1-2627-003041');
  too_short_count integer;
BEGIN
  SELECT count(*)
  INTO too_short_count
  FROM public.service_reception_entries
  WHERE nullif(btrim(jc_number), '') IS NOT NULL
    AND char_length(btrim(jc_number)) < min_jc_len;

  IF too_short_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce minimum JC number length on service_reception_entries: % rows have trimmed jc_number shorter than % characters. Fix them first, then rerun migration.',
      too_short_count,
      min_jc_len;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_service_reception_entries_jc_number_min_len'
      AND conrelid = 'public.service_reception_entries'::regclass
  ) THEN
    ALTER TABLE public.service_reception_entries
      ADD CONSTRAINT chk_service_reception_entries_jc_number_min_len
      CHECK (
        nullif(btrim(jc_number), '') IS NULL
        OR char_length(btrim(jc_number)) >= char_length('JC-MBTPLT-JP1-2627-003041')
      );
  END IF;
END;
$$;

COMMIT;