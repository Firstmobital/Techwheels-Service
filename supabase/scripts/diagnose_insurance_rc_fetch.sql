-- Insurance RC fetch / admin panel — run in Supabase SQL Editor to find root cause.
-- (52 IDSPay calls in 24h is normal; this checks DB + cron, not provider volume.)

-- 1) Required objects exist?
SELECT 'insurance_renewal_rc_fetch_jobs' AS object,
       EXISTS (
         SELECT 1 FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'insurance_renewal_rc_fetch_jobs'
       ) AS ok
UNION ALL
SELECT 'insurance_renewal_rc_fetch_attempts',
       EXISTS (
         SELECT 1 FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'insurance_renewal_rc_fetch_attempts'
       )
UNION ALL
SELECT 'rpc pending_counts',
       EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'insurance_renewal_rc_fetch_pending_counts'
       )
UNION ALL
SELECT 'rpc campaign_status (UI)',
       EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'insurance_renewal_rc_fetch_campaign_status'
       )
UNION ALL
SELECT 'rpc diagnostics (optional)',
       EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'insurance_renewal_rc_fetch_diagnostics'
       );

-- 2) Pending RC work for active campaigns (replace id if needed)
SELECT c.id, c.campaign_name, p.*
FROM insurance_renewal_campaigns c
CROSS JOIN LATERAL insurance_renewal_rc_fetch_pending_counts(c.id) p
WHERE c.status = 'active'
ORDER BY c.id;

-- 3) RC jobs in last 7 days
SELECT id, campaign_id, status, stats, last_error, created_at, started_at, completed_at
FROM insurance_renewal_rc_fetch_jobs
WHERE created_at > now() - interval '7 days'
ORDER BY created_at DESC
LIMIT 20;

-- 4) IDSPay attempts in last 24h (your “52 API calls” likely means this)
SELECT outcome, count(*) AS n
FROM insurance_renewal_rc_fetch_attempts
WHERE attempted_at > now() - interval '24 hours'
GROUP BY outcome
ORDER BY n DESC;

-- 5) Cron worker registered?
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE command ILIKE '%invoke_insurance_renewal_rc_fetch_worker%'
   OR jobname ILIKE '%insurance-renewal-rc-fetch%';

-- 6) Recent pg_net calls to Edge (401 = JWT verify / wrong URL; null body = timeout)
SELECT id, status_code, error_msg, created, left(content, 200) AS body_preview
FROM net._http_response
WHERE created > now() - interval '48 hours'
  AND (
    content ILIKE '%insurance-renewal-telecalling%'
    OR content ILIKE '%process_rc_fetch_jobs%'
    OR error_msg IS NOT NULL
  )
ORDER BY created DESC
LIMIT 30;
