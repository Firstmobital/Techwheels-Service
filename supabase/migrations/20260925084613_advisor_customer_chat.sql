-- CHAT-001: dealer-scoped vehicle chat between a customer session and any staff user with chat view.
-- Writes go through SECURITY DEFINER RPCs. Authenticated staff may SELECT for realtime.
-- Customer anon clients have no table grant.

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE public.advisor_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_code text NOT NULL,
  reg_number text NOT NULL,
  reg_key text NOT NULL,
  phone_10 text NOT NULL,
  customer_name text,
  jc_number text,
  sa_name text,
  last_message_at timestamptz,
  last_message_preview text,
  last_author_side text,
  staff_unread_count integer NOT NULL DEFAULT 0,
  customer_unread_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT advisor_chats_phone_10_check CHECK (phone_10 ~ '^[0-9]{10}$'),
  CONSTRAINT advisor_chats_reg_key_check CHECK (length(btrim(reg_key)) > 0),
  CONSTRAINT advisor_chats_last_author_side_check CHECK (
    last_author_side IS NULL OR last_author_side = ANY (ARRAY['customer'::text, 'staff'::text])
  ),
  CONSTRAINT advisor_chats_staff_unread_check CHECK (staff_unread_count >= 0),
  CONSTRAINT advisor_chats_customer_unread_check CHECK (customer_unread_count >= 0)
);

CREATE UNIQUE INDEX ux_advisor_chats_dealer_reg_phone
  ON public.advisor_chats (dealer_code, reg_key, phone_10);

CREATE INDEX idx_advisor_chats_dealer_last_message
  ON public.advisor_chats (dealer_code, last_message_at DESC);

CREATE TABLE public.advisor_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.advisor_chats(id) ON DELETE CASCADE,
  author_side text NOT NULL,
  author_user_id uuid,
  author_name text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT advisor_chat_messages_author_side_check CHECK (
    author_side = ANY (ARRAY['customer'::text, 'staff'::text])
  ),
  CONSTRAINT advisor_chat_messages_body_len_check CHECK (
    char_length(btrim(body)) BETWEEN 1 AND 2000
  )
);

CREATE INDEX idx_advisor_chat_messages_chat_created
  ON public.advisor_chat_messages (chat_id, created_at);

-- ── Module ──────────────────────────────────────────────────────────────────

INSERT INTO public.modules (name, label, description, icon, route, sort_order, is_active)
VALUES (
  'chat',
  'Chat',
  'Workshop inbox for customer vehicle conversations.',
  'message-circle',
  '/chat',
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM public.modules),
  true
)
ON CONFLICT (name) DO NOTHING;

-- ── Access ──────────────────────────────────────────────────────────────────

ALTER TABLE public.advisor_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_chat_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.advisor_chats FROM anon, authenticated;
REVOKE ALL ON TABLE public.advisor_chat_messages FROM anon, authenticated;

GRANT SELECT ON TABLE public.advisor_chats TO authenticated;
GRANT SELECT ON TABLE public.advisor_chat_messages TO authenticated;

GRANT ALL ON TABLE public.advisor_chats TO service_role;
GRANT ALL ON TABLE public.advisor_chat_messages TO service_role;

CREATE POLICY advisor_chats_select_staff
  ON public.advisor_chats
  FOR SELECT
  TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND (public.is_admin() OR public.has_module_view('chat'))
  );

CREATE POLICY advisor_chat_messages_select_staff
  ON public.advisor_chat_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.advisor_chats c
      WHERE c.id = advisor_chat_messages.chat_id
        AND c.dealer_code = public.my_dealer_code()
        AND (public.is_admin() OR public.has_module_view('chat'))
    )
  );

ALTER TABLE public.advisor_chats REPLICA IDENTITY FULL;
ALTER TABLE public.advisor_chat_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'advisor_chats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.advisor_chats;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'advisor_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.advisor_chat_messages;
  END IF;
END $$;

-- ── Customer context ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.customer_advisor_chat_context(
  p_session_token text,
  p_reg_number text
)
RETURNS TABLE (
  phone_10 text,
  reg_key text,
  reg_number text,
  dealer_code text,
  customer_name text,
  jc_number text,
  sa_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sess record;
  v_reg text;
BEGIN
  v_reg := public.customer_assert_reg(p_session_token, p_reg_number);
  SELECT * INTO v_sess FROM public.customer_require_session(p_session_token);

  RETURN QUERY
  SELECT
    v_sess.phone,
    v_reg,
    s.reg_number,
    s.dealer_code,
    s.owner_name,
    s.jc_number,
    COALESCE(NULLIF(btrim(s.sa_display_name), ''), s.sa_name)
  FROM public.service_reception_entries s
  WHERE public.customer_norm_reg(s.reg_number) = v_reg
    AND public.customer_last10_digits(s.owner_phone) = v_sess.phone
    AND NULLIF(btrim(s.dealer_code), '') IS NOT NULL
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_sess.phone,
    v_reg,
    v.reg_number,
    v.dealer_code,
    v.owner_name,
    NULL::text,
    NULL::text
  FROM public.vehicles v
  WHERE public.customer_norm_reg(v.reg_number) = v_reg
    AND public.customer_last10_digits(v.owner_phone) = v_sess.phone
    AND NULLIF(btrim(v.dealer_code), '') IS NOT NULL
  ORDER BY v.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found for this session.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.customer_advisor_chat_context(text, text) FROM PUBLIC, anon, authenticated;

-- ── Staff gate ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.advisor_chat_require_staff()
RETURNS TABLE (
  user_id uuid,
  dealer_code text,
  author_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dealer text;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.is_admin() OR public.has_module_view('chat')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  v_dealer := NULLIF(btrim(public.my_dealer_code()), '');
  IF v_dealer IS NULL THEN
    RAISE EXCEPTION 'Dealer code required';
  END IF;

  SELECT COALESCE(NULLIF(btrim(u.full_name), ''), NULLIF(btrim(u.email), ''), 'Staff')
  INTO v_name
  FROM public.users u
  WHERE u.id = v_uid;

  user_id := v_uid;
  dealer_code := v_dealer;
  author_name := COALESCE(v_name, 'Staff');
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.advisor_chat_require_staff() FROM PUBLIC, anon, authenticated;

-- ── Customer RPCs ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.customer_list_advisor_messages(
  p_session_token text,
  p_reg_number text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ctx record;
  v_chat public.advisor_chats%ROWTYPE;
  v_messages jsonb;
BEGIN
  SELECT * INTO v_ctx
  FROM public.customer_advisor_chat_context(p_session_token, p_reg_number)
  LIMIT 1;

  SELECT * INTO v_chat
  FROM public.advisor_chats c
  WHERE c.dealer_code = v_ctx.dealer_code
    AND c.reg_key = v_ctx.reg_key
    AND c.phone_10 = v_ctx.phone_10
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'chat', NULL,
      'messages', '[]'::jsonb
    );
  END IF;

  IF v_chat.customer_unread_count > 0 THEN
    UPDATE public.advisor_chats
    SET customer_unread_count = 0,
        updated_at = now()
    WHERE id = v_chat.id;
    v_chat.customer_unread_count := 0;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.created_at), '[]'::jsonb)
  INTO v_messages
  FROM public.advisor_chat_messages m
  WHERE m.chat_id = v_chat.id;

  RETURN jsonb_build_object(
    'chat', to_jsonb(v_chat),
    'messages', v_messages
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_send_advisor_message(
  p_session_token text,
  p_reg_number text,
  p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ctx record;
  v_body text := btrim(COALESCE(p_body, ''));
  v_chat public.advisor_chats%ROWTYPE;
  v_message public.advisor_chat_messages%ROWTYPE;
  v_name text;
BEGIN
  IF char_length(v_body) < 1 THEN
    RAISE EXCEPTION 'Message should be at least 1 character.';
  END IF;
  IF char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'Message is too long.';
  END IF;

  SELECT * INTO v_ctx
  FROM public.customer_advisor_chat_context(p_session_token, p_reg_number)
  LIMIT 1;

  v_name := COALESCE(NULLIF(btrim(v_ctx.customer_name), ''), 'Customer');

  INSERT INTO public.advisor_chats (
    dealer_code, reg_number, reg_key, phone_10, customer_name, jc_number, sa_name
  )
  VALUES (
    v_ctx.dealer_code, v_ctx.reg_number, v_ctx.reg_key, v_ctx.phone_10,
    v_ctx.customer_name, v_ctx.jc_number, v_ctx.sa_name
  )
  ON CONFLICT (dealer_code, reg_key, phone_10) DO UPDATE
  SET reg_number = EXCLUDED.reg_number,
      customer_name = COALESCE(EXCLUDED.customer_name, public.advisor_chats.customer_name),
      jc_number = COALESCE(EXCLUDED.jc_number, public.advisor_chats.jc_number),
      sa_name = COALESCE(EXCLUDED.sa_name, public.advisor_chats.sa_name),
      updated_at = now()
  RETURNING * INTO v_chat;

  SELECT * INTO v_chat
  FROM public.advisor_chats
  WHERE id = v_chat.id
  FOR UPDATE;

  INSERT INTO public.advisor_chat_messages (chat_id, author_side, author_user_id, author_name, body)
  VALUES (v_chat.id, 'customer', NULL, v_name, v_body)
  RETURNING * INTO v_message;

  UPDATE public.advisor_chats
  SET last_message_at = v_message.created_at,
      last_message_preview = left(v_body, 160),
      last_author_side = 'customer',
      staff_unread_count = staff_unread_count + 1,
      customer_unread_count = 0,
      updated_at = now()
  WHERE id = v_chat.id
  RETURNING * INTO v_chat;

  RETURN jsonb_build_object(
    'chat', to_jsonb(v_chat),
    'message', to_jsonb(v_message)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.customer_list_advisor_messages(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_send_advisor_message(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_list_advisor_messages(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_send_advisor_message(text, text, text) TO anon, authenticated, service_role;

-- ── Staff RPCs ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.advisor_chat_list()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_staff record;
  v_rows jsonb;
BEGIN
  SELECT * INTO v_staff FROM public.advisor_chat_require_staff() LIMIT 1;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(c) ORDER BY c.last_message_at DESC),
    '[]'::jsonb
  )
  INTO v_rows
  FROM public.advisor_chats c
  WHERE c.dealer_code = v_staff.dealer_code
    AND c.last_message_at IS NOT NULL;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.advisor_chat_get(p_chat_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_staff record;
  v_chat public.advisor_chats%ROWTYPE;
  v_messages jsonb;
BEGIN
  SELECT * INTO v_staff FROM public.advisor_chat_require_staff() LIMIT 1;

  SELECT * INTO v_chat
  FROM public.advisor_chats
  WHERE id = p_chat_id
    AND dealer_code = v_staff.dealer_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat not found';
  END IF;

  IF v_chat.staff_unread_count > 0 THEN
    UPDATE public.advisor_chats
    SET staff_unread_count = 0,
        updated_at = now()
    WHERE id = v_chat.id;
    v_chat.staff_unread_count := 0;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.created_at), '[]'::jsonb)
  INTO v_messages
  FROM public.advisor_chat_messages m
  WHERE m.chat_id = v_chat.id;

  RETURN jsonb_build_object(
    'chat', to_jsonb(v_chat),
    'messages', v_messages
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advisor_chat_send(
  p_chat_id uuid,
  p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_staff record;
  v_body text := btrim(COALESCE(p_body, ''));
  v_chat public.advisor_chats%ROWTYPE;
  v_message public.advisor_chat_messages%ROWTYPE;
BEGIN
  IF char_length(v_body) < 1 THEN
    RAISE EXCEPTION 'Message should be at least 1 character.';
  END IF;
  IF char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'Message is too long.';
  END IF;

  SELECT * INTO v_staff FROM public.advisor_chat_require_staff() LIMIT 1;

  SELECT * INTO v_chat
  FROM public.advisor_chats
  WHERE id = p_chat_id
    AND dealer_code = v_staff.dealer_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat not found';
  END IF;

  INSERT INTO public.advisor_chat_messages (chat_id, author_side, author_user_id, author_name, body)
  VALUES (v_chat.id, 'staff', v_staff.user_id, v_staff.author_name, v_body)
  RETURNING * INTO v_message;

  UPDATE public.advisor_chats
  SET last_message_at = v_message.created_at,
      last_message_preview = left(v_body, 160),
      last_author_side = 'staff',
      customer_unread_count = customer_unread_count + 1,
      updated_at = now()
  WHERE id = v_chat.id
  RETURNING * INTO v_chat;

  RETURN jsonb_build_object(
    'chat', to_jsonb(v_chat),
    'message', to_jsonb(v_message)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advisor_chat_unread_count()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_staff record;
  v_count integer;
BEGIN
  SELECT * INTO v_staff FROM public.advisor_chat_require_staff() LIMIT 1;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM public.advisor_chats c
  WHERE c.dealer_code = v_staff.dealer_code
    AND c.staff_unread_count > 0;

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.advisor_chat_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.advisor_chat_get(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.advisor_chat_send(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.advisor_chat_unread_count() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.advisor_chat_list() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisor_chat_get(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisor_chat_send(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisor_chat_unread_count() TO authenticated, service_role;
