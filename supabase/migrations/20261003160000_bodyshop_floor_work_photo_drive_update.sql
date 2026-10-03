-- Allow edge function (service role) and app to persist Drive ids after universal-drive-upload.
-- Service role already bypasses RLS; grant supports optional client-side drive_url patch.

GRANT UPDATE (drive_url, drive_file_id) ON public.bodyshop_floor_role_daily_log_photos TO authenticated;

DROP POLICY IF EXISTS bodyshop_floor_role_daily_log_photos_update_drive ON public.bodyshop_floor_role_daily_log_photos;
CREATE POLICY bodyshop_floor_role_daily_log_photos_update_drive
  ON public.bodyshop_floor_role_daily_log_photos
  FOR UPDATE
  TO authenticated
  USING (public.bodyshop_floor_work_can_write_daily_log_photo(log_id))
  WITH CHECK (public.bodyshop_floor_work_can_write_daily_log_photo(log_id));
