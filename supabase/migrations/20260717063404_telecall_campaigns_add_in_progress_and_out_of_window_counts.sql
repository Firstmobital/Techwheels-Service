ALTER TABLE telecall_campaigns
  ADD COLUMN IF NOT EXISTS in_progress_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS out_of_window_count integer DEFAULT 0;
