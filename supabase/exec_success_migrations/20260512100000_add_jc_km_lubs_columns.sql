ALTER TABLE job_card_closed_data
  ADD COLUMN IF NOT EXISTS kms_run numeric,
  ADD COLUMN IF NOT EXISTS last_service_km numeric,
  ADD COLUMN IF NOT EXISTS last_service_date date,
  ADD COLUMN IF NOT EXISTS lubs_revenue numeric DEFAULT 0;

COMMENT ON COLUMN job_card_closed_data.kms_run IS 'Current odometer reading from JC Revenue KMs Run column';
COMMENT ON COLUMN job_card_closed_data.last_service_km IS 'Odometer at previous service from Last Service KM column';
COMMENT ON COLUMN job_card_closed_data.last_service_date IS 'Date of previous service';
COMMENT ON COLUMN job_card_closed_data.lubs_revenue IS 'Lubricants revenue (separate from labour and spares)';
