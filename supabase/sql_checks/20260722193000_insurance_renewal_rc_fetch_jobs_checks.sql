-- Checks for 20260722193000_insurance_renewal_rc_fetch_jobs.sql

SELECT EXISTS (
  SELECT 1 FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'insurance_renewal_rc_fetch_jobs'
) AS jobs_table_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'insurance_renewal_rc_fetch_attempts'
) AS attempts_table_exists;

SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'insurance_renewal_rc_fetch_pending_counts',
    'insurance_renewal_rc_fetch_next_candidates',
    'invoke_insurance_renewal_rc_fetch_worker'
  )
ORDER BY 1;

SELECT j.jobname, j.schedule, j.active
FROM cron.job j
WHERE j.command ILIKE '%invoke_insurance_renewal_rc_fetch_worker%';
