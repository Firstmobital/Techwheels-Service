-- Web Chat module still sees every dealer thread.
-- A staff phone can open a thread without that module when the user is part of it:
-- they are the vehicle's service advisor, they already replied, or they are the helpdesk contact.

CREATE OR REPLACE FUNCTION public.advisor_chat_user_involved(
  p_chat_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.advisor_chats c
    WHERE c.id = p_chat_id
      AND EXISTS (
        SELECT 1
        FROM public.user_employee_links uel
        WHERE uel.user_id = p_user_id
          AND uel.is_active = true
          AND uel.dealer_code = c.dealer_code
      )
      AND (
        EXISTS (
          SELECT 1
          FROM public.advisor_chat_messages m
          WHERE m.chat_id = c.id
            AND m.author_side = 'staff'
            AND m.author_user_id = p_user_id
        )
        OR (
          COALESCE(c.contact_key, 'advisor') = 'advisor'
          AND NULLIF(btrim(c.sa_name), '') IS NOT NULL
          AND (
            EXISTS (
              SELECT 1
              FROM public.users u
              WHERE u.id = p_user_id
                AND u.is_active = true
                AND lower(btrim(u.full_name)) = lower(btrim(c.sa_name))
            )
            OR EXISTS (
              SELECT 1
              FROM public.user_employee_links uel
              JOIN public.employee_master em ON upper(btrim(em.employee_code)) = upper(btrim(uel.employee_code))
              WHERE uel.user_id = p_user_id
                AND uel.is_active = true
                AND uel.dealer_code = c.dealer_code
                AND lower(btrim(em.employee_name)) = lower(btrim(c.sa_name))
            )
            OR EXISTS (
              SELECT 1
              FROM public.user_employee_links uel
              WHERE uel.user_id = p_user_id
                AND uel.is_active = true
                AND uel.dealer_code = c.dealer_code
                AND upper(btrim(uel.employee_code)) = (
                  SELECT upper(btrim(s.sa_employee_code))
                  FROM public.service_reception_entries s
                  WHERE s.dealer_code = c.dealer_code
                    AND public.customer_norm_reg(s.reg_number) = c.reg_key
                    AND NULLIF(btrim(s.sa_employee_code), '') IS NOT NULL
                  ORDER BY s.created_at DESC
                  LIMIT 1
                )
            )
          )
        )
        OR (
          COALESCE(c.contact_key, 'advisor') <> 'advisor'
          AND EXISTS (
            SELECT 1
            FROM public.settings_customer_helpdesk_contacts h
            JOIN public.users u ON u.id = p_user_id AND u.is_active = true
            WHERE h.is_active = true
              AND h.chat_contact_key = c.contact_key
              AND (
                lower(btrim(u.full_name)) = lower(btrim(h.contact_name))
                OR (
                  NULLIF(btrim(h.email), '') IS NOT NULL
                  AND lower(btrim(u.email)) = lower(btrim(h.email))
                )
                OR EXISTS (
                  SELECT 1
                  FROM public.user_employee_links uel
                  JOIN public.employee_master em ON upper(btrim(em.employee_code)) = upper(btrim(uel.employee_code))
                  WHERE uel.user_id = p_user_id
                    AND uel.is_active = true
                    AND uel.dealer_code = c.dealer_code
                    AND lower(btrim(em.employee_name)) = lower(btrim(h.contact_name))
                )
              )
          )
        )
      )
  );
$$;

DROP FUNCTION IF EXISTS public.advisor_chat_require_staff();

CREATE OR REPLACE FUNCTION public.advisor_chat_require_staff()
RETURNS TABLE (
  user_id uuid,
  dealer_code text,
  author_name text,
  see_all boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dealer text;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid AND u.is_active = true) THEN
    RAISE EXCEPTION 'Not authenticated';
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
  see_all := public.is_admin() OR public.has_module_view('chat');
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.advisor_chat_list()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_staff record;
  v_rows jsonb;
BEGIN
  SELECT * INTO v_staff FROM public.advisor_chat_require_staff() LIMIT 1;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.last_message_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM public.advisor_chats c
  WHERE c.dealer_code = v_staff.dealer_code
    AND c.last_message_at IS NOT NULL
    AND (
      v_staff.see_all
      OR public.advisor_chat_user_involved(c.id, v_staff.user_id)
    );

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.advisor_chat_get(p_chat_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
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
    AND (
      v_staff.see_all
      OR public.advisor_chat_user_involved(id, v_staff.user_id)
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat not found';
  END IF;

  IF v_chat.staff_unread_count > 0 THEN
    UPDATE public.advisor_chats
    SET staff_unread_count = 0, updated_at = now()
    WHERE id = v_chat.id;
    v_chat.staff_unread_count := 0;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.created_at), '[]'::jsonb)
  INTO v_messages
  FROM public.advisor_chat_messages m
  WHERE m.chat_id = v_chat.id;

  RETURN jsonb_build_object('chat', to_jsonb(v_chat), 'messages', v_messages);
END;
$$;

CREATE OR REPLACE FUNCTION public.advisor_chat_send(p_chat_id uuid, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
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
    AND (
      v_staff.see_all
      OR public.advisor_chat_user_involved(id, v_staff.user_id)
    )
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

  RETURN jsonb_build_object('chat', to_jsonb(v_chat), 'message', to_jsonb(v_message));
END;
$$;

CREATE OR REPLACE FUNCTION public.advisor_chat_unread_count()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
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
    AND c.staff_unread_count > 0
    AND (
      v_staff.see_all
      OR public.advisor_chat_user_involved(c.id, v_staff.user_id)
    );

  RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_advisor_chat_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_chat public.advisor_chats%ROWTYPE;
  v_title text;
  v_body text;
  v_data jsonb;
BEGIN
  SELECT * INTO v_chat FROM public.advisor_chats WHERE id = NEW.chat_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_title := left(btrim(v_chat.reg_number), 80);
  IF COALESCE(v_chat.contact_key, 'advisor') <> 'advisor' AND NULLIF(btrim(v_chat.sa_name), '') IS NOT NULL THEN
    v_title := left(btrim(v_chat.reg_number) || ' · ' || btrim(v_chat.sa_name), 80);
  END IF;
  v_body := left(btrim(NEW.body), 160);
  v_data := jsonb_build_object(
    'chat_id', v_chat.id::text,
    'reg_number', v_chat.reg_number,
    'audience', CASE WHEN NEW.author_side = 'customer' THEN 'staff' ELSE 'customer' END,
    'contact_key', COALESCE(v_chat.contact_key, 'advisor')
  );

  IF NEW.author_side = 'customer' THEN
    INSERT INTO public.chat_push_outbox (message_id, token_id, title, body, chat_id, data)
    SELECT NEW.id, t.id, v_title, v_body, v_chat.id, v_data
    FROM public.device_push_tokens t
    JOIN public.users u ON u.id = t.user_id AND u.is_active = true
    WHERE t.audience = 'staff'
      AND t.is_active
      AND (NEW.author_user_id IS NULL OR t.user_id IS DISTINCT FROM NEW.author_user_id)
      AND EXISTS (
        SELECT 1
        FROM public.user_employee_links uel
        WHERE uel.user_id = u.id
          AND uel.is_active = true
          AND uel.dealer_code = v_chat.dealer_code
      )
      AND (
        u.role = ANY (ARRAY['admin'::text, 'super_admin'::text])
        OR EXISTS (
          SELECT 1
          FROM public.user_module_permissions p
          JOIN public.modules m ON m.id = p.module_id
          WHERE p.user_id = u.id
            AND m.name = 'chat'
            AND m.is_active = true
            AND p.can_view = true
        )
        OR public.advisor_chat_user_involved(v_chat.id, u.id)
      )
    ON CONFLICT (message_id, token_id) DO NOTHING;
  ELSIF NEW.author_side = 'staff' THEN
    INSERT INTO public.chat_push_outbox (message_id, token_id, title, body, chat_id, data)
    SELECT NEW.id, t.id, v_title, v_body, v_chat.id, v_data
    FROM public.device_push_tokens t
    WHERE t.audience = 'customer'
      AND t.is_active
      AND t.phone_10 = v_chat.phone_10
      AND (NEW.author_user_id IS NULL OR t.user_id IS DISTINCT FROM NEW.author_user_id)
    ON CONFLICT (message_id, token_id) DO NOTHING;
  END IF;

  BEGIN
    PERFORM public.invoke_send_chat_push();
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.advisor_chat_user_involved(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advisor_chat_require_staff() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advisor_chat_list() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisor_chat_get(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisor_chat_send(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisor_chat_unread_count() TO authenticated, service_role;
