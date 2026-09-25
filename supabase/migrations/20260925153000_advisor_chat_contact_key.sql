-- Separate in-app chat threads per helpdesk contact (same vehicle + customer phone).

ALTER TABLE public.advisor_chats
  ADD COLUMN IF NOT EXISTS contact_key text NOT NULL DEFAULT 'advisor';

UPDATE public.advisor_chats
SET contact_key = 'advisor'
WHERE contact_key IS NULL OR btrim(contact_key) = '';

ALTER TABLE public.advisor_chats
  DROP CONSTRAINT IF EXISTS advisor_chats_contact_key_check;

ALTER TABLE public.advisor_chats
  ADD CONSTRAINT advisor_chats_contact_key_check CHECK (
    contact_key = ANY (
      ARRAY[
        'advisor'::text,
        'payal'::text,
        'govind'::text,
        'rajesh'::text,
        'tata_akshay'::text,
        'tata_gurmeet'::text
      ]
    )
  );

DROP INDEX IF EXISTS public.ux_advisor_chats_dealer_reg_phone;

CREATE UNIQUE INDEX IF NOT EXISTS ux_advisor_chats_dealer_reg_phone_contact
  ON public.advisor_chats (dealer_code, reg_key, phone_10, contact_key);

CREATE OR REPLACE FUNCTION public.customer_helpdesk_peer_name(
  p_contact_key text,
  p_default_sa text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE btrim(COALESCE(p_contact_key, 'advisor'))
    WHEN 'payal' THEN 'Payal Makhija'
    WHEN 'govind' THEN 'Govind Singh'
    WHEN 'rajesh' THEN 'Mr Rajesh Panday'
    WHEN 'tata_akshay' THEN 'Mr Akshay Jethalia'
    WHEN 'tata_gurmeet' THEN 'Mr Gurmeet Singh'
    ELSE COALESCE(NULLIF(btrim(p_default_sa), ''), 'Service advisor')
  END;
$$;

DROP FUNCTION IF EXISTS public.customer_list_advisor_messages(text, text);

CREATE OR REPLACE FUNCTION public.customer_list_advisor_messages(
  p_session_token text,
  p_reg_number text,
  p_contact_key text DEFAULT 'advisor'
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
  v_contact text := COALESCE(NULLIF(btrim(p_contact_key), ''), 'advisor');
BEGIN
  SELECT * INTO v_ctx
  FROM public.customer_advisor_chat_context(p_session_token, p_reg_number)
  LIMIT 1;

  SELECT * INTO v_chat
  FROM public.advisor_chats c
  WHERE c.dealer_code = v_ctx.dealer_code
    AND c.reg_key = v_ctx.reg_key
    AND c.phone_10 = v_ctx.phone_10
    AND c.contact_key = v_contact
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

DROP FUNCTION IF EXISTS public.customer_send_advisor_message(text, text, text);

CREATE OR REPLACE FUNCTION public.customer_send_advisor_message(
  p_session_token text,
  p_reg_number text,
  p_body text,
  p_contact_key text DEFAULT 'advisor'
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
  v_contact text := COALESCE(NULLIF(btrim(p_contact_key), ''), 'advisor');
  v_peer text;
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
  v_peer := public.customer_helpdesk_peer_name(v_contact, v_ctx.sa_name);

  INSERT INTO public.advisor_chats (
    dealer_code, reg_number, reg_key, phone_10, customer_name, jc_number, sa_name, contact_key
  )
  VALUES (
    v_ctx.dealer_code, v_ctx.reg_number, v_ctx.reg_key, v_ctx.phone_10,
    v_ctx.customer_name, v_ctx.jc_number, v_peer, v_contact
  )
  ON CONFLICT (dealer_code, reg_key, phone_10, contact_key) DO UPDATE
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

REVOKE ALL ON FUNCTION public.customer_list_advisor_messages(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_send_advisor_message(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_list_advisor_messages(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_send_advisor_message(text, text, text, text) TO anon, authenticated, service_role;
