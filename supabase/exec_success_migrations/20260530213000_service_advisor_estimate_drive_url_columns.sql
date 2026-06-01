BEGIN;

ALTER TABLE public.service_reception_entries
  ADD COLUMN IF NOT EXISTS estimate_drive_url text,
  ADD COLUMN IF NOT EXISTS estimate_drive_file_id text;

COMMIT;
