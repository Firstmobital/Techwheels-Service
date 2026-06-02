-- Delete test reception entries whose job card number does not start with 'JC-'
--
-- Run manually in Supabase SQL Editor.
--
-- Matching rule:
-- - Keep rows where trimmed jc_number starts with JC- (case-insensitive)
-- - Delete rows where jc_number is NULL/blank OR does not start with JC-

-- 1) Preview count
SELECT count(*) AS rows_to_delete
FROM public.service_reception_entries
WHERE coalesce(nullif(btrim(jc_number), ''), '') !~* '^JC-';

-- 2) Preview sample rows (before delete)
SELECT id, dealer_code, reg_number, model, jc_number, source, created_at
FROM public.service_reception_entries
WHERE coalesce(nullif(btrim(jc_number), ''), '') !~* '^JC-'
ORDER BY created_at DESC
LIMIT 200;

-- 3) Execute delete
BEGIN;

WITH deleted AS (
  DELETE FROM public.service_reception_entries
  WHERE coalesce(nullif(btrim(jc_number), ''), '') !~* '^JC-'
  RETURNING id, dealer_code, reg_number, jc_number, source, created_at
)
SELECT count(*) AS deleted_rows FROM deleted;

COMMIT;

-- 4) Post-check
SELECT count(*) AS remaining_invalid_jc_rows
FROM public.service_reception_entries
WHERE coalesce(nullif(btrim(jc_number), ''), '') !~* '^JC-';
