-- Body Shop Customer App: mobile + OTP session infrastructure.
--
-- Modeled on the existing complaint_access_links / generate_complaint_link
-- pattern (see 20260817130000_fix_generate_complaint_link_pgcrypto.sql): all
-- real access logic lives in SECURITY DEFINER RPCs (next migration), these
-- tables carry no anon RLS policy of their own so a leaked/guessed row can
-- never be read directly -- only through the validated RPC surface.

CREATE TABLE public.bodyshop_customer_otp_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dealer_code text NOT NULL,
  reception_entry_id bigint NOT NULL REFERENCES public.service_reception_entries(id),
  mobile text NOT NULL,
  otp_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bodyshop_customer_otp_requests_mobile_valid CHECK (mobile ~ '^[0-9]{10}$')
);

CREATE INDEX bodyshop_customer_otp_requests_mobile_idx
  ON public.bodyshop_customer_otp_requests (mobile, created_at DESC);

COMMENT ON TABLE public.bodyshop_customer_otp_requests IS
  'Body Shop Customer App: one row per OTP send attempt. otp_hash only, never the raw OTP. Read/written exclusively via request_customer_otp / verify_customer_otp SECURITY DEFINER RPCs.';

CREATE TABLE public.bodyshop_customer_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dealer_code text NOT NULL,
  reception_entry_id bigint NOT NULL REFERENCES public.service_reception_entries(id),
  mobile text NOT NULL,
  session_token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone,
  CONSTRAINT bodyshop_customer_sessions_status_check
    CHECK (status = ANY (ARRAY['active', 'revoked', 'expired']))
);

CREATE INDEX bodyshop_customer_sessions_token_idx
  ON public.bodyshop_customer_sessions (session_token);

COMMENT ON TABLE public.bodyshop_customer_sessions IS
  'Body Shop Customer App: active customer session tokens minted by verify_customer_otp. Every customer-facing RPC (get_customer_repair_summary, customer_submit_query, ...) takes p_session_token and re-validates it against this table -- never a raw mobile number or reception_entry_id.';

ALTER TABLE public.bodyshop_customer_otp_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodyshop_customer_sessions ENABLE ROW LEVEL SECURITY;

-- Staff/admin visibility for support and audit purposes only. No anon or
-- authenticated-customer policy is defined; all customer-side access goes
-- through the SECURITY DEFINER RPCs, which bypass RLS internally.
CREATE POLICY admin_unrestricted_all_ops_v1 ON public.bodyshop_customer_otp_requests
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY staff_view_own_dealer_otp_requests ON public.bodyshop_customer_otp_requests
  FOR SELECT TO authenticated
  USING (dealer_code = public.my_dealer_code() AND public.has_module_view('bodyshop_repair'));

CREATE POLICY admin_unrestricted_all_ops_v1 ON public.bodyshop_customer_sessions
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY staff_view_own_dealer_customer_sessions ON public.bodyshop_customer_sessions
  FOR SELECT TO authenticated
  USING (dealer_code = public.my_dealer_code() AND public.has_module_view('bodyshop_repair'));

GRANT SELECT ON public.bodyshop_customer_otp_requests TO authenticated;
GRANT SELECT ON public.bodyshop_customer_sessions TO authenticated;
GRANT ALL ON public.bodyshop_customer_otp_requests TO service_role;
GRANT ALL ON public.bodyshop_customer_sessions TO service_role;
