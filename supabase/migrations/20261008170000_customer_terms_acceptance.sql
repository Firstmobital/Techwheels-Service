-- Customer portal: Terms & Conditions acceptance (phone profile, versioned)

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_accepted_version text;

COMMENT ON COLUMN public.customer_profiles.terms_accepted_at IS 'When customer accepted portal T&C (IST audit via timestamptz).';
COMMENT ON COLUMN public.customer_profiles.terms_accepted_version IS 'Version id of T&C accepted; must match customer_current_terms_version() for portal access.';

CREATE OR REPLACE FUNCTION public.customer_current_terms_version()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT 'techwheels-service-repair-handover-2026-10-08'::text;
$$;

CREATE OR REPLACE FUNCTION public.customer_profile_needs_terms(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.customer_profiles p
    WHERE p.id = p_profile_id
      AND p.terms_accepted_at IS NOT NULL
      AND p.terms_accepted_version = public.customer_current_terms_version()
  );
$$;

CREATE OR REPLACE FUNCTION public.customer_terms_status_for_profile(p_profile_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'required_version', public.customer_current_terms_version(),
    'accepted_version', p.terms_accepted_version,
    'accepted_at', p.terms_accepted_at,
    'needs_acceptance', public.customer_profile_needs_terms(p.id)
  )
  FROM public.customer_profiles p
  WHERE p.id = p_profile_id;
$$;

-- Session lookup without T&C gate (for accept + status RPCs)
CREATE OR REPLACE FUNCTION public.customer_lookup_session_row(p_session_token text)
RETURNS TABLE(profile_id uuid, phone text, session_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_hash text;
  v_profile_id uuid;
  v_phone text;
  v_session_id uuid;
BEGIN
  PERFORM public.customer_reject_staff_jwt();

  IF p_session_token IS NULL OR btrim(p_session_token) = '' THEN
    RAISE EXCEPTION 'Session expired.';
  END IF;

  v_hash := public.customer_hash_token(btrim(p_session_token));

  SELECT p.id, p.phone, s.id
  INTO v_profile_id, v_phone, v_session_id
  FROM public.customer_sessions s
  JOIN public.customer_profiles p ON p.id = s.profile_id
  WHERE s.token_hash = v_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session expired.';
  END IF;

  profile_id := v_profile_id;
  phone := v_phone;
  session_id := v_session_id;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_require_session(p_session_token text)
RETURNS TABLE(profile_id uuid, phone text, session_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_profile_id uuid;
  v_phone text;
  v_session_id uuid;
BEGIN
  SELECT ls.profile_id, ls.phone, ls.session_id
  INTO v_profile_id, v_phone, v_session_id
  FROM public.customer_lookup_session_row(p_session_token) AS ls
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Session expired.';
  END IF;

  IF public.customer_profile_needs_terms(v_profile_id) THEN
    RAISE EXCEPTION 'terms_acceptance_required';
  END IF;

  RETURN QUERY SELECT v_profile_id, v_phone, v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_get_terms_status(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  SELECT ls.profile_id INTO v_profile_id
  FROM public.customer_lookup_session_row(p_session_token) AS ls
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Session expired.';
  END IF;

  RETURN public.customer_terms_status_for_profile(v_profile_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_accept_terms(p_session_token text, p_terms_version text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_profile_id uuid;
  v_required text := public.customer_current_terms_version();
BEGIN
  SELECT ls.profile_id INTO v_profile_id
  FROM public.customer_lookup_session_row(p_session_token) AS ls
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Session expired.';
  END IF;

  IF btrim(coalesce(p_terms_version, '')) <> v_required THEN
    RAISE EXCEPTION 'terms_version_mismatch';
  END IF;

  UPDATE public.customer_profiles
  SET terms_accepted_at = now(),
      terms_accepted_version = v_required,
      updated_at = now()
  WHERE id = v_profile_id;

  RETURN public.customer_terms_status_for_profile(v_profile_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_start_session(p_username text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user text := public.customer_last10_digits(p_username);
  v_pass text := public.customer_last10_digits(p_password);
  v_phone_key text := coalesce(v_user, v_pass, 'invalid');
  v_attempt_count int;
  v_vehicles jsonb;
  v_profile_id uuid;
  v_token text;
  v_expires timestamptz := now() + interval '12 hours';
  v_terms jsonb;
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
  IF v_vehicles IS NULL OR jsonb_array_length(v_vehicles) = 0 THEN
    RAISE EXCEPTION 'No vehicle found for this mobile number.';
  END IF;

  INSERT INTO public.customer_profiles (phone, last_login_at, updated_at)
  VALUES (v_user, now(), now())
  ON CONFLICT (phone) DO UPDATE
    SET last_login_at = now(),
        updated_at = now()
  RETURNING id INTO v_profile_id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.customer_sessions (profile_id, token_hash, expires_at)
  VALUES (v_profile_id, public.customer_hash_token(v_token), v_expires);

  v_terms := public.customer_terms_status_for_profile(v_profile_id);

  RETURN jsonb_build_object(
    'session_token', v_token,
    'expires_at', v_expires,
    'phone', v_user,
    'vehicles', v_vehicles,
    'terms', v_terms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.customer_get_terms_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_get_terms_status(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.customer_accept_terms(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_accept_terms(text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.customer_lookup_session_row(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_lookup_session_row(text) TO service_role;

COMMENT ON FUNCTION public.customer_get_terms_status(text) IS 'Returns T&C acceptance state for active customer session.';
COMMENT ON FUNCTION public.customer_accept_terms(text, text) IS 'Records customer acceptance of current portal T&C version.';
