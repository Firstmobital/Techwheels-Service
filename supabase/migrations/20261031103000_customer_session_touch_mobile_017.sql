-- MOBILE-017: Customer session sliding expiry + revoke sibling tokens on login.
-- No OTP. Phone=phone custom sessions unchanged.

CREATE OR REPLACE FUNCTION public.customer_touch_session(p_session_token text)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $$
DECLARE
  v_session_id uuid;
  v_expires    timestamptz;
  v_created    timestamptz;
  v_new_expires timestamptz;
BEGIN
  PERFORM public.customer_reject_staff_jwt();

  SELECT ls.session_id
  INTO v_session_id
  FROM public.customer_lookup_session_row(p_session_token) AS ls
  LIMIT 1;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Session expired.';
  END IF;

  SELECT s.expires_at, s.created_at
  INTO v_expires, v_created
  FROM public.customer_sessions s
  WHERE s.id = v_session_id;

  v_new_expires := least(
    v_created + interval '7 days',
    greatest(v_expires, now() + interval '12 hours')
  );

  UPDATE public.customer_sessions
  SET expires_at = v_new_expires
  WHERE id = v_session_id;

  RETURN jsonb_build_object('ok', true, 'expires_at', v_new_expires);
END;
$$;

COMMENT ON FUNCTION public.customer_touch_session(p_session_token text) IS
  'MOBILE-017: Extend active customer portal session (sliding 12h from touch, cap 7d from session created_at).';

REVOKE ALL ON FUNCTION public.customer_touch_session(p_session_token text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_touch_session(p_session_token text) TO anon, authenticated, service_role;

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
  v_token_hash    text;
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
  v_token_hash := public.customer_hash_token(v_token);

  INSERT INTO public.customer_sessions (profile_id, token_hash, expires_at)
  VALUES (v_profile_id, v_token_hash, v_expires);

  UPDATE public.customer_sessions
  SET revoked_at = now()
  WHERE profile_id = v_profile_id
    AND revoked_at IS NULL
    AND token_hash <> v_token_hash;

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
  'MOBILE-016 / MOBILE-011 / MOBILE-017: phone=phone login; revokes other active sessions for profile; returns session_token + vehicles.';
