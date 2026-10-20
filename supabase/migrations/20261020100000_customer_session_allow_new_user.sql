-- MOBILE-016: Allow new customers (no vehicle history) to log in.
-- Previously customer_start_session raised an exception when no vehicle was found,
-- blocking new users entirely. Now it returns an empty vehicles array and new_user=true.

CREATE OR REPLACE FUNCTION public.customer_start_session(p_username text, p_password text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user          text := public.customer_last10_digits(p_username);
  v_pass          text := public.customer_last10_digits(p_password);
  v_phone_key     text := coalesce(v_user, v_pass, 'invalid');
  v_attempt_count int;
  v_vehicles      jsonb;
  v_profile_id    uuid;
  v_token         text;
  v_expires       timestamptz := now() + interval '12 hours';
  v_terms         jsonb;
BEGIN
  PERFORM public.customer_reject_staff_jwt();

  INSERT INTO public.customer_auth_attempts (phone_key) VALUES (v_phone_key);
  SELECT count(*) INTO v_attempt_count
  FROM public.customer_auth_attempts
  WHERE phone_key = v_phone_key
    AND attempted_at > now() - interval '15 minutes';
  IF v_attempt_count > 10 THEN
    RAISE EXCEPTION 'Invalid mobile number.';
  END IF;

  IF v_user IS NULL OR v_pass IS NULL OR v_user <> v_pass THEN
    RAISE EXCEPTION 'Invalid mobile number.';
  END IF;

  -- Collect vehicles — allow empty (new user with no DMS history)
  v_vehicles := public.customer_collect_vehicles(v_user);
  IF v_vehicles IS NULL THEN
    v_vehicles := '[]'::jsonb;
  END IF;

  INSERT INTO public.customer_profiles (phone, last_login_at, updated_at)
  VALUES (v_user, now(), now())
  ON CONFLICT (phone) DO UPDATE
    SET last_login_at = now(),
        updated_at    = now()
  RETURNING id INTO v_profile_id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.customer_sessions (profile_id, token_hash, expires_at)
  VALUES (v_profile_id, public.customer_hash_token(v_token), v_expires);

  v_terms := public.customer_terms_status_for_profile(v_profile_id);

  RETURN jsonb_build_object(
    'session_token', v_token,
    'expires_at',    v_expires,
    'phone',         v_user,
    'vehicles',      v_vehicles,
    'new_user',      (jsonb_array_length(v_vehicles) = 0),
    'terms',         v_terms
  );
END;
$$;

COMMENT ON FUNCTION public.customer_start_session(text, text) IS
  'MOBILE-016 / MOBILE-011: username and password must be the same 10-digit mobile. '
  'Returns session_token + vehicles (may be empty for new users). '
  'new_user=true when no vehicles found — app routes to register-vehicle screen.';
