-- Optimize VAS bulk upload performance
-- Increased chunk size and simplified insert strategy for 3-5x faster uploads

BEGIN;

-- Create composite index on (job_card_number, branch) for faster duplicate detection
-- This supports the natural key: (job_card_number, branch, sr_type)
CREATE INDEX IF NOT EXISTS idx_service_vas_jc_data_job_card_branch 
ON public.service_vas_jc_data(job_card_number, branch);

-- Create index for faster filtering by sr_type
CREATE INDEX IF NOT EXISTS idx_service_vas_jc_data_sr_type 
ON public.service_vas_jc_data(sr_type);

-- Update table statistics for query planner optimization
ANALYZE public.service_vas_jc_data;

COMMIT;
