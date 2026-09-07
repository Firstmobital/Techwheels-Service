-- Body Shop Customer App: OTP request/verify RPCs.
--
-- Design note (why two separate privilege levels): request_customer_otp
-- returns the *plaintext* OTP so it can be relayed to the customer -- it must
-- therefore never be callable by the public browser client. It is restricted
-- to service_role and is only ever invoked from the customer-otp-request edge
-- function (which holds the service-role key as a server-side secret and is
-- the only place that actually sends the WhatsApp message). No plaintext OTP
-- is ever written to a migration, log, or client response.
--
-- verify_customer_otp only ever compares a hash and mints an opaque session
-- token, so it is safe to grant directly to anon, mirroring the existing
-- get_complaint_by_token / raise_complaint precedent.

CREATE FUNCTION public.request_customer_otp(p_mobile text, p_reg_number text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_entry_id bigint;
  v_dealer_code text;
  v_otp text;
  v_otp_hash text;
  v_recent_count integer;
BEGIN
  IF p_mobile !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'Invalid mobile number';
  END IF;

  -- Rate limit: at most 5 OTP requests per mobile number per 15 minutes.
  SELECT count(*) INTO v_recent_count
  FROM public.bodyshop_customer_otp_requests
  WHERE mobile = p_mobile AND created_at > now() - interval '15 minutes';

  IF v_recent_count >= 5 THEN
    RAISE EXCEPTION 'Too many OTP requests. Please try again later.';
  END IF;

  -- Match against the most recent active reception entry for this
  -- mobile + registration number pair (existing authority, no new customer
  -- identity table introduced).
  SELECT id, dealer_code INTO v_entry_id, v_dealer_code
  FROM public.service_reception_entries
  WHERE owner_phone = p_mobile
    AND upper(btrim(reg_number)) = upper(btrim(p_reg_number))
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_entry_id IS NULL THEN
    -- Do not reveal whether the mobile/registration pair exists; caller
    -- (the edge function) returns a generic response either way.
    RETURN jsonb_build_object('found', false);
  END IF;

  v_otp := lpad(floor(random() * 1000000)::text, 6, '0');
  v_otp_hash := extensions.crypt(v_otp, extensions.gen_salt('bf'));

  INSERT INTO public.bodyshop_customer_otp_requests (
    dealer_code, reception_entry_id, mobile, otp_hash, expires_at
  ) VALUES (
    v_dealer_code, v_entry_id, p_mobile, v_otp_hash, now() + interval '10 minutes'
  );

  RETURN jsonb_build_object(
    'found', true,
    'otp', v_otp,
    'mobile', p_mobile,
    'expires_in_seconds', 600
  );
END;
$$;

COMMENT ON FUNCTION public.request_customer_otp(text, text) IS
  'Generates and stores a hashed OTP for Body Shop Customer App access. Returns the plaintext OTP for relay by the calling edge function -- restricted to service_role, never exposed to anon/authenticated.';

REVOKE ALL ON FUNCTION public.request_customer_otp(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_customer_otp(text, text) TO service_role;

CREATE FUNCTION public.verify_customer_otp(p_mobile text, p_otp text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request record;
  v_session_token text;
  v_dealer_code text;
  v_entry_id bigint;
BEGIN
  IF p_mobile !~ '^[0-9]{10}$' OR p_otp !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'Invalid mobile number or code';
  END IF;

  SELECT * INTO v_request
  FROM public.bodyshop_customer_otp_requests
  WHERE mobile = p_mobile
    AND consumed_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Code expired or not found. Please request a new code.';
  END IF;

  IF v_request.attempt_count >= 5 THEN
    RAISE EXCEPTION 'Too many incorrect attempts. Please request a new code.';
  END IF;

  UPDATE public.bodyshop_customer_otp_requests
  SET attempt_count = attempt_count + 1
  WHERE id = v_request.id;

  IF extensions.crypt(p_otp, v_request.otp_hash) != v_request.otp_hash THEN
    RAISE EXCEPTION 'Incorrect code.';
  END IF;

  UPDATE public.bodyshop_customer_otp_requests
  SET consumed_at = now()
  WHERE id = v_request.id;

  v_dealer_code := v_request.dealer_code;
  v_entry_id := v_request.reception_entry_id;

  v_session_token := REPLACE(REPLACE(REPLACE(
    encode(extensions.gen_random_bytes(24), 'base64'), '/', '_'), '+', '-'), '=', '');

  INSERT INTO public.bodyshop_customer_sessions (
    dealer_code, reception_entry_id, mobile, session_token, expires_at
  ) VALUES (
    v_dealer_code, v_entry_id, p_mobile, v_session_token, now() + interval '30 days'
  );

  RETURN jsonb_build_object(
    'session_token', v_session_token,
    'expires_in_seconds', 30 * 24 * 3600
  );
END;
$$;

COMMENT ON FUNCTION public.verify_customer_otp(text, text) IS
  'Validates an OTP and mints a Body Shop Customer App session token. Safe to grant to anon: never exposes internal identifiers, only an opaque session token.';

GRANT EXECUTE ON FUNCTION public.verify_customer_otp(text, text) TO anon, authenticated;
