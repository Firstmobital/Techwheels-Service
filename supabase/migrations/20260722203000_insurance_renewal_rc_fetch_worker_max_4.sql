-- RC fetch worker: explicit max_lookups=4 per tick (cron remains */2).
-- Apply after deploy insurance-renewal-telecalling with RC_FETCH_DEFAULT_LOOKUPS=4.

CREATE OR REPLACE FUNCTION public.invoke_insurance_renewal_rc_fetch_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://jmdndcphkmaljhwgzqxq.supabase.co/functions/v1/insurance-renewal-telecalling',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'd4738d9a19012e96922a7e9d53959c0b8169ba573743e08f5609a9a601986511'
    ),
    body := '{"action":"process_rc_fetch_jobs","max_lookups":4}'::jsonb,
    timeout_milliseconds := 120000
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$$;
