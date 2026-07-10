-- Increase pg_net wait time for booking-source-sync.
--
-- The edge function can legitimately take longer than pg_net's default 5s
-- timeout while processing a batch. Without this, the sync may complete but
-- net._http_response records a timeout instead of the function response.

create or replace function public.invoke_booking_source_sync_incremental_daily()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
begin
  select net.http_post(
    url := 'https://jmdndcphkmaljhwgzqxq.supabase.co/functions/v1/booking-source-sync',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{"dry_run": false, "batch_size": 200}'::jsonb,
    timeout_milliseconds := 60000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

comment on function public.invoke_booking_source_sync_incremental_daily() is
  'Daily IST 01:00 scheduler wrapper for booking-source-sync edge function (incremental insert-only mode; 60s pg_net timeout).';

grant execute on function public.invoke_booking_source_sync_incremental_daily()
  to postgres, service_role;
