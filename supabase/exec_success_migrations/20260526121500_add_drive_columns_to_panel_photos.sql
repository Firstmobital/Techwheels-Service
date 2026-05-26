BEGIN;

DO $$
BEGIN
  IF to_regclass('public.panel_photos') IS NULL THEN
    RAISE EXCEPTION 'public.panel_photos not found. Run this migration against the Techwheels project/database matching authoritative full_database.sql.';
  END IF;

  ALTER TABLE public.panel_photos
  ADD COLUMN IF NOT EXISTS drive_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS drive_file_id TEXT DEFAULT NULL;
END $$;

COMMIT;
