-- Drive offload fields for floor work photos (same pattern as bodyshop_intake_vehicle_photos).

ALTER TABLE public.bodyshop_floor_role_daily_log_photos
  ADD COLUMN IF NOT EXISTS reg_number text,
  ADD COLUMN IF NOT EXISTS drive_url text,
  ADD COLUMN IF NOT EXISTS drive_file_id text;

COMMENT ON COLUMN public.bodyshop_floor_role_daily_log_photos.reg_number IS
  'Vehicle registration for Google Drive folder (denormalized at upload).';

COMMENT ON COLUMN public.bodyshop_floor_role_daily_log_photos.drive_url IS
  'Google Drive view URL after universal-drive-upload sync.';
