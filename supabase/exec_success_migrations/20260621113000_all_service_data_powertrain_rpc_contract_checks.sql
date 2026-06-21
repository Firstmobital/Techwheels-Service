-- Read-only checks for Fuel RPC contract deployment

-- 1) Functions exist
SELECT proname, oidvectortypes(proargtypes) AS args
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('rpc_fuel_queue', 'rpc_fuel_resolve', 'rpc_fuel_overrides')
ORDER BY proname;

-- 2) Queue contract shape (admin session expected)
SELECT
  session_user AS session_user,
  current_setting('request.jwt.claim.role', true) AS jwt_role,
  auth.uid() AS auth_uid,
  public.is_admin() AS is_admin,
  public.can_manage_fuel_rules() AS can_manage_fuel_rules;

SELECT public.rpc_fuel_queue(5) AS queue_payload;

-- 3) Optional: list active overrides via RPC (admin session expected)
SELECT *
FROM public.rpc_fuel_overrides(true, 20, 0);

-- 4) Manual resolve dry-run guidance
-- IMPORTANT: This statement writes data; run only when intentionally resolving one product_line.
-- SELECT public.rpc_fuel_resolve('Punch Adventure Rhythm', 'PETROL', 10, 'manual verified', 5);
