-- P2-01: Prevent Supabase Free-plan DB inactivity pause
--
-- Supabase Free tier pauses the DB after 7 days of inactivity.
-- This pg_cron job runs a lightweight SELECT every 4 days to prevent that,
-- while keeping DB load negligible (single-row read from pg_stat_activity).
--
-- Schedule: every 4 days at 06:00 UTC (well within the 7-day pause window).
-- Cost: one trivial query per 4 days — no measurable performance impact.
--
-- Prerequisites: pg_cron extension must be enabled (Supabase enables it by default).
-- The job runs as the postgres superuser role inside the DB.

SELECT cron.schedule(
  'techwheels-inactivity-prevention-ping',   -- job name (idempotent via unschedule below)
  '0 6 */4 * *',                             -- every 4 days at 06:00 UTC
  $$SELECT 1 FROM pg_stat_activity LIMIT 1$$ -- cheapest possible query
);

-- cron.schedule with a job_name is idempotent in pg_cron >=1.4:
-- re-running this migration will update the existing job rather than error.
