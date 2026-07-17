ALTER TABLE telecall_campaigns ADD COLUMN IF NOT EXISTS callback_later_count integer DEFAULT 0;
