-- Insurance renewal: auto "Refresh Now" every 2 hours; queue RC fetch when new-to-fetch > 0.
-- Daily drip + leaderboard stay on the once-per-day job (8:30 AM IST).

DO $$
BEGIN
  PERFORM cron.unschedule('insurance-renewal-daily-refresh');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('insurance-renewal-auto-refresh');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('insurance-renewal-daily-tasks');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Every 2 hours at :00 — refresh campaigns, then enqueue RC fetch if pending_with_vrn > 0.
SELECT cron.schedule(
  'insurance-renewal-auto-refresh',
  '0 */2 * * *',
  $$
    SELECT net.http_post(
      url := 'https://jmdndcphkmaljhwgzqxq.supabase.co/functions/v1/insurance-renewal-telecalling',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'action', 'cron_auto_refresh',
        'cron_secret', 'techwheels_cron_2026'
      )
    );
  $$
);

-- Once daily at 3:00 AM UTC (8:30 AM IST) — WhatsApp drip + leaderboard only.
SELECT cron.schedule(
  'insurance-renewal-daily-tasks',
  '0 3 * * *',
  $$
    SELECT net.http_post(
      url := 'https://jmdndcphkmaljhwgzqxq.supabase.co/functions/v1/insurance-renewal-telecalling',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'action', 'cron_daily_refresh',
        'cron_secret', 'techwheels_cron_2026'
      )
    );
  $$
);
