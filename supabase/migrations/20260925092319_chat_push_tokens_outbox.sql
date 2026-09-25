-- Chat push: device tokens, outbox, register RPCs, enqueue trigger, cron drain.
-- Send RPCs stay as applied. A message insert enqueues; a failed push does not roll it back.

CREATE TABLE public.device_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience text NOT NULL,
  user_id uuid,
  phone_10 text,
  device_token text NOT NULL,
  token_provider text NOT NULL,
  token_platform text NOT NULL,
  app_version text,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_push_tokens_audience_check CHECK (audience = ANY (ARRAY['staff'::text, 'customer'::text])),
  CONSTRAINT device_push_tokens_provider_check CHECK (token_provider = ANY (ARRAY['fcm'::text, 'expo'::text])),
  CONSTRAINT device_push_tokens_platform_check CHECK (token_platform = ANY (ARRAY['ios'::text, 'android'::text])),
  CONSTRAINT device_push_tokens_owner_check CHECK (
    (audience = 'staff' AND user_id IS NOT NULL AND phone_10 IS NULL)
    OR (audience = 'customer' AND user_id IS NULL AND phone_10 IS NOT NULL)
  )
);

CREATE UNIQUE INDEX device_push_tokens_token_uidx ON public.device_push_tokens (device_token);
CREATE INDEX device_push_tokens_staff_active_idx
  ON public.device_push_tokens (user_id)
  WHERE audience = 'staff' AND is_active;
CREATE INDEX device_push_tokens_customer_active_idx
  ON public.device_push_tokens (phone_10)
  WHERE audience = 'customer' AND is_active;

CREATE TABLE public.chat_push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.advisor_chat_messages (id) ON DELETE CASCADE,
  token_id uuid NOT NULL REFERENCES public.device_push_tokens (id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  chat_id uuid NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT chat_push_outbox_status_check CHECK (status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'failed'::text])),
  CONSTRAINT chat_push_outbox_message_token_uidx UNIQUE (message_id, token_id)
);

CREATE INDEX chat_push_outbox_pending_idx
  ON public.chat_push_outbox (created_at)
  WHERE status = 'pending';

ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_push_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.device_push_tokens FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.chat_push_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.device_push_tokens TO service_role;
GRANT ALL ON TABLE public.chat_push_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.register_staff_device_token(
  p_device_token text,
  p_token_provider text,
  p_token_platform text,
  p_app_version text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_token text := btrim(COALESCE(p_device_token, ''));
  v_provider text := lower(btrim(COALESCE(p_token_provider, '')));
  v_platform text := lower(btrim(COALESCE(p_token_platform, '')));
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid AND u.is_active = true) THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF char_length(v_token) < 10 OR char_length(v_token) > 4096 THEN
    RAISE EXCEPTION 'Invalid device token';
  END IF;
  IF v_provider NOT IN ('fcm', 'expo') OR v_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'Invalid token metadata';
  END IF;

  INSERT INTO public.device_push_tokens (
    audience, user_id, phone_10, device_token, token_provider, token_platform, app_version, is_active, last_used_at
  ) VALUES (
    'staff', v_uid, NULL, v_token, v_provider, v_platform, NULLIF(btrim(COALESCE(p_app_version, '')), ''), true, now()
  )
  ON CONFLICT (device_token) DO UPDATE SET
    audience = 'staff',
    user_id = EXCLUDED.user_id,
    phone_10 = NULL,
    token_provider = EXCLUDED.token_provider,
    token_platform = EXCLUDED.token_platform,
    app_version = EXCLUDED.app_version,
    is_active = true,
    last_used_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_staff_device_token(p_device_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.device_push_tokens
  SET is_active = false, last_used_at = now()
  WHERE device_token = btrim(COALESCE(p_device_token, ''))
    AND audience = 'staff'
    AND user_id = v_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_register_device_token(
  p_session_token text,
  p_device_token text,
  p_token_provider text,
  p_token_platform text,
  p_app_version text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_session record;
  v_token text := btrim(COALESCE(p_device_token, ''));
  v_provider text := lower(btrim(COALESCE(p_token_provider, '')));
  v_platform text := lower(btrim(COALESCE(p_token_platform, '')));
  v_id uuid;
BEGIN
  SELECT * INTO v_session FROM public.customer_require_session(p_session_token);
  IF char_length(v_token) < 10 OR char_length(v_token) > 4096 THEN
    RAISE EXCEPTION 'Invalid device token';
  END IF;
  IF v_provider NOT IN ('fcm', 'expo') OR v_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'Invalid token metadata';
  END IF;

  INSERT INTO public.device_push_tokens (
    audience, user_id, phone_10, device_token, token_provider, token_platform, app_version, is_active, last_used_at
  ) VALUES (
    'customer', NULL, v_session.phone, v_token, v_provider, v_platform, NULLIF(btrim(COALESCE(p_app_version, '')), ''), true, now()
  )
  ON CONFLICT (device_token) DO UPDATE SET
    audience = 'customer',
    user_id = NULL,
    phone_10 = EXCLUDED.phone_10,
    token_provider = EXCLUDED.token_provider,
    token_platform = EXCLUDED.token_platform,
    app_version = EXCLUDED.app_version,
    is_active = true,
    last_used_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_deactivate_device_token(
  p_session_token text,
  p_device_token text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_session record;
BEGIN
  SELECT * INTO v_session FROM public.customer_require_session(p_session_token);
  UPDATE public.device_push_tokens
  SET is_active = false, last_used_at = now()
  WHERE device_token = btrim(COALESCE(p_device_token, ''))
    AND audience = 'customer'
    AND phone_10 = v_session.phone;
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
  v_body := left(btrim(NEW.body), 160);
  v_data := jsonb_build_object(
    'chat_id', v_chat.id::text,
    'reg_number', v_chat.reg_number,
    'audience', CASE WHEN NEW.author_side = 'customer' THEN 'staff' ELSE 'customer' END
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

CREATE TRIGGER advisor_chat_messages_enqueue_push
  AFTER INSERT ON public.advisor_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_advisor_chat_push();

CREATE OR REPLACE FUNCTION public.claim_chat_push_outbox(p_limit integer DEFAULT 40)
RETURNS TABLE (
  id uuid,
  token_id uuid,
  title text,
  body text,
  chat_id uuid,
  data jsonb,
  device_token text,
  token_provider text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT o.id
    FROM public.chat_push_outbox o
    WHERE o.status = 'pending'
    ORDER BY o.created_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 40), 100))
    FOR UPDATE OF o SKIP LOCKED
  ),
  updated AS (
    UPDATE public.chat_push_outbox o
    SET status = 'sending'
    FROM claimed c
    WHERE o.id = c.id
    RETURNING o.id, o.token_id, o.title, o.body, o.chat_id, o.data
  )
  SELECT u.id, u.token_id, u.title, u.body, u.chat_id, u.data, t.device_token, t.token_provider
  FROM updated u
  JOIN public.device_push_tokens t ON t.id = u.token_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_chat_push_outbox(
  p_id uuid,
  p_status text,
  p_error_text text DEFAULT NULL,
  p_deactivate_token boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_token uuid;
BEGIN
  IF p_status NOT IN ('sent', 'failed', 'pending') THEN
    RAISE EXCEPTION 'Invalid outbox status';
  END IF;

  UPDATE public.chat_push_outbox
  SET status = p_status,
      error_text = NULLIF(left(COALESCE(p_error_text, ''), 500), ''),
      sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END
  WHERE id = p_id
  RETURNING token_id INTO v_token;

  IF p_deactivate_token AND v_token IS NOT NULL THEN
    UPDATE public.device_push_tokens
    SET is_active = false, last_used_at = now()
    WHERE id = v_token;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_send_chat_push()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://jmdndcphkmaljhwgzqxq.supabase.co/functions/v1/send-chat-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_send_chat_push()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_job_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — skipping send-chat-push schedule';
    RETURN;
  END IF;

  SELECT j.jobid INTO v_job_id
  FROM cron.job j
  WHERE j.jobname = 'send-chat-push'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'send-chat-push',
    '* * * * *',
    $job$ SELECT public.invoke_send_chat_push(); $job$
  );
END;
$$;

SELECT public.schedule_send_chat_push();

REVOKE ALL ON FUNCTION public.register_staff_device_token(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deactivate_staff_device_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_staff_device_token(text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_staff_device_token(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.customer_register_device_token(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_deactivate_device_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_register_device_token(text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_deactivate_device_token(text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.enqueue_advisor_chat_push() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_chat_push_outbox(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_chat_push_outbox(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoke_send_chat_push() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schedule_send_chat_push() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_chat_push_outbox(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_chat_push_outbox(uuid, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoke_send_chat_push() TO service_role;
GRANT EXECUTE ON FUNCTION public.schedule_send_chat_push() TO service_role;
