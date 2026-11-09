-- Security audit fixes: service_bookings RLS, admin-only get_permissions_for_user,
-- booking-source-sync cron secret for pg_net invoke.

CREATE OR REPLACE FUNCTION public.user_can_view_service_bookings()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT public.is_admin()
    OR public.has_module_view('service_booking')
    OR public.has_module_modify('service_booking')
    OR public.has_module_view('driver_management')
    OR public.has_module_modify('driver_management')
    OR public.has_module_view('cre_incentive')
    OR public.has_module_modify('cre_incentive');
$$;

CREATE OR REPLACE FUNCTION public.user_can_modify_service_bookings()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT public.is_admin()
    OR public.has_module_modify('service_booking')
    OR public.has_module_modify('driver_management');
$$;

COMMENT ON FUNCTION public.user_can_view_service_bookings() IS
  'RLS helper: staff with service_booking, driver_management, or cre_incentive (view) modules.';
COMMENT ON FUNCTION public.user_can_modify_service_bookings() IS
  'RLS helper: staff who may insert/update/delete service_bookings rows.';

DROP POLICY IF EXISTS service_bookings_all_auth ON public.service_bookings;

CREATE POLICY service_bookings_module_select ON public.service_bookings
  FOR SELECT
  TO authenticated
  USING (public.user_can_view_service_bookings());

CREATE POLICY service_bookings_module_insert ON public.service_bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_modify_service_bookings());

CREATE POLICY service_bookings_module_update ON public.service_bookings
  FOR UPDATE
  TO authenticated
  USING (public.user_can_modify_service_bookings())
  WITH CHECK (public.user_can_modify_service_bookings());

CREATE POLICY service_bookings_module_delete ON public.service_bookings
  FOR DELETE
  TO authenticated
  USING (public.user_can_modify_service_bookings());

CREATE OR REPLACE FUNCTION public.get_permissions_for_user(target_user_id uuid)
RETURNS TABLE(
  module_name text,
  module_label text,
  module_route text,
  can_view boolean,
  can_modify boolean,
  can_delete boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin access required'
      USING ERRCODE = '42501';
  END IF;

  IF target_user_id IS NULL THEN
  RETURN;
  END IF;

  RETURN QUERY
  SELECT m.name, m.label, m.route, p.can_view, p.can_modify, p.can_delete
  FROM public.user_module_permissions p
  JOIN public.modules m ON m.id = p.module_id
  WHERE p.user_id = target_user_id
    AND m.is_active = true
    AND p.can_view = true
  ORDER BY m.sort_order;
END;
$$;

COMMENT ON FUNCTION public.get_permissions_for_user(uuid) IS
  'Admin-only: returns active module permissions for impersonation and user administration.';

REVOKE ALL ON FUNCTION public.get_permissions_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_permissions_for_user(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_permissions_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_permissions_for_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_booking_source_sync_incremental_daily() RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_cron_secret text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret
  INTO v_cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'booking_source_sync_cron_secret'
  LIMIT 1;

  IF v_cron_secret IS NULL OR btrim(v_cron_secret) = '' THEN
    RAISE EXCEPTION
      'invoke_booking_source_sync_incremental_daily: Vault secret '
      '''booking_source_sync_cron_secret'' not found or empty. '
      'Set the same value as Edge env BOOKING_SOURCE_SYNC_CRON_SECRET.';
  END IF;

  SELECT net.http_post(
    url := 'https://jmdndcphkmaljhwgzqxq.supabase.co/functions/v1/booking-source-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_cron_secret
    ),
    body := '{"dry_run": false, "batch_size": 200}'::jsonb,
    timeout_milliseconds := 60000
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION public.invoke_booking_source_sync_incremental_daily() IS
  'Daily booking-source-sync via pg_net. Sends x-cron-secret from Vault (booking_source_sync_cron_secret).';
