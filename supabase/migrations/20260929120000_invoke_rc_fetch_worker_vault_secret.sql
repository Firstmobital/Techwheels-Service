-- Forward-only migration: replace invoke_insurance_renewal_rc_fetch_worker()
-- to read the cron secret from Supabase Vault instead of a hardcoded literal.
--
-- Supersedes the definition last written in:
--   20260722203000_insurance_renewal_rc_fetch_worker_max_4.sql
-- Those historical files are NOT modified (migrations are immutable evidence).
--
-- The Vault secret that must exist before applying this migration:
--   name  = 'telecalling_cron_secret'
--   (created via Supabase Dashboard → Vault, or supabase secrets set)
--
-- The Edge Function reads the same secret via:
--   Deno.env.get('TELECALLING_CRON_SECRET')
-- Both the DB caller and the Edge Function now use the SAME rotated secret.
--
-- Fail-closed behavior: if the Vault secret is absent or empty, the function
-- raises an exception and the pg_net request is NOT sent.
-- This prevents accidental calls with an empty x-cron-secret header.

CREATE OR REPLACE FUNCTION public.invoke_insurance_renewal_rc_fetch_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cron_secret text;
  v_request_id  bigint;
BEGIN
  -- Fetch the rotated cron secret by stable name from Supabase Vault.
  -- vault.decrypted_secrets is a view that decrypts on read; the value is
  -- never stored in an unencrypted column and is not logged or returned here.
  SELECT decrypted_secret
  INTO   v_cron_secret
  FROM   vault.decrypted_secrets
  WHERE  name = 'telecalling_cron_secret'
  LIMIT  1;

  -- Fail closed: do not send an empty or absent header.
  IF v_cron_secret IS NULL OR v_cron_secret = '' THEN
    RAISE EXCEPTION
      'invoke_insurance_renewal_rc_fetch_worker: Vault secret '
      '''telecalling_cron_secret'' not found or empty. '
      'Configure the secret before scheduling this function.';
  END IF;

  SELECT net.http_post(
    url                  := 'https://jmdndcphkmaljhwgzqxq.supabase.co/functions/v1/insurance-renewal-telecalling',
    headers              := jsonb_build_object(
                              'Content-Type',   'application/json',
                              'x-cron-secret',  v_cron_secret
                            ),
    body                 := '{"action":"process_rc_fetch_jobs","max_lookups":4}'::jsonb,
    timeout_milliseconds := 120000
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION public.invoke_insurance_renewal_rc_fetch_worker() IS
  'Triggers the insurance-renewal-telecalling edge function via pg_net. '
  'Authenticates using x-cron-secret read from Supabase Vault '
  '(telecalling_cron_secret). Fails closed if the Vault secret is absent.';

-- Preserve existing grants from 20260722193000_insurance_renewal_rc_fetch_jobs.sql
-- No new roles granted.
GRANT EXECUTE ON FUNCTION public.invoke_insurance_renewal_rc_fetch_worker()
  TO postgres, service_role;
