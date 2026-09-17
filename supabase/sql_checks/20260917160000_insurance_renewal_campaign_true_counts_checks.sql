-- Read-only verification checks for:
-- supabase/migrations/20260917160000_insurance_renewal_campaign_true_counts.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'insurance_renewal_campaign_count_snapshot',
    'insurance_renewal_recount_campaign',
    'trg_insurance_renewal_campaigns_force_true_counts'
  )
ORDER BY 1;

SELECT
  t.tgname,
  t.tgenabled = 'O' AS enabled,
  pg_get_triggerdef(t.oid) LIKE '%BEFORE UPDATE%' AS before_update,
  pg_get_triggerdef(t.oid) LIKE '%trg_insurance_renewal_campaigns_force_true_counts%' AS uses_force_fn
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'insurance_renewal_campaigns'
  AND t.tgname = 'trg_insurance_renewal_campaigns_force_true_counts'
  AND NOT t.tgisinternal;

SELECT
  pg_get_functiondef(p.oid) LIKE '%count(*)%'
  AND pg_get_functiondef(p.oid) NOT LIKE '%LIMIT 10000%'
    AS snapshot_uses_uncapped_count
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'insurance_renewal_campaign_count_snapshot';
