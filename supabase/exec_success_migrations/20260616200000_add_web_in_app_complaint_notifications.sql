-- Web in-app complaint notifications
--
-- Purpose:
--   Extend complaint_notifications for in-app web delivery and add authenticated
--   RPCs for listing and marking notifications.

BEGIN;

ALTER TABLE public.complaint_notifications
  ADD COLUMN IF NOT EXISTS recipient_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

ALTER TABLE public.complaint_notifications
  DROP CONSTRAINT IF EXISTS complaint_notifications_channel_check;

ALTER TABLE public.complaint_notifications
  ADD CONSTRAINT complaint_notifications_channel_check
  CHECK (channel = ANY (ARRAY['sms','email','whatsapp','in_app']));

CREATE INDEX IF NOT EXISTS ix_complaint_notifications_recipient_created
  ON public.complaint_notifications (recipient_user_id, created_at DESC)
  WHERE channel = 'in_app';

CREATE INDEX IF NOT EXISTS ix_complaint_notifications_unread
  ON public.complaint_notifications (recipient_user_id, created_at DESC)
  WHERE channel = 'in_app' AND read_at IS NULL AND dismissed_at IS NULL;

DROP POLICY IF EXISTS complaint_notifications_select ON public.complaint_notifications;
CREATE POLICY complaint_notifications_select
ON public.complaint_notifications
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR public.dealer_code_in_scope(dealer_code)
  OR recipient_user_id = auth.uid()
);

CREATE OR REPLACE FUNCTION public.trg_cn_write_notifications_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_assigned_email text;
BEGIN
  -- New complaint raised: notify assigned staff in-app/email and customer sms.
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.complaint_notifications (
        dealer_code, complaint_id, event_type, recipient_type, recipient_user_id, channel, payload
      ) VALUES (
        NEW.dealer_code,
        NEW.id,
        'raised',
        'staff',
        NEW.assigned_to,
        'in_app',
        jsonb_build_object('ticket_number', NEW.ticket_number, 'title', NEW.title, 'branch', NEW.branch)
      );
    END IF;

    SELECT u.email INTO v_assigned_email
    FROM public.users u
    WHERE u.id = NEW.assigned_to;

    IF v_assigned_email IS NOT NULL THEN
      INSERT INTO public.complaint_notifications (
        dealer_code, complaint_id, event_type, recipient_type, recipient_email, channel, payload
      ) VALUES (
        NEW.dealer_code,
        NEW.id,
        'raised',
        'staff',
        v_assigned_email,
        'email',
        jsonb_build_object('ticket_number', NEW.ticket_number, 'branch', NEW.branch)
      );
    END IF;

    IF NEW.customer_phone IS NOT NULL THEN
      INSERT INTO public.complaint_notifications (
        dealer_code, complaint_id, event_type, recipient_type, recipient_phone, channel, payload
      ) VALUES (
        NEW.dealer_code,
        NEW.id,
        'raised',
        'customer',
        NEW.customer_phone,
        'sms',
        jsonb_build_object('ticket_number', NEW.ticket_number, 'status', NEW.status)
      );
    END IF;

    RETURN NEW;
  END IF;

  -- Status transitions: notify customer via sms and assigned staff in-app.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.customer_phone IS NOT NULL THEN
      INSERT INTO public.complaint_notifications (
        dealer_code, complaint_id, event_type, recipient_type, recipient_phone, channel, payload
      ) VALUES (
        NEW.dealer_code,
        NEW.id,
        NEW.status,
        'customer',
        NEW.customer_phone,
        'sms',
        jsonb_build_object('ticket_number', NEW.ticket_number, 'from_status', OLD.status, 'to_status', NEW.status)
      );
    END IF;

    IF NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.complaint_notifications (
        dealer_code, complaint_id, event_type, recipient_type, recipient_user_id, channel, payload
      ) VALUES (
        NEW.dealer_code,
        NEW.id,
        NEW.status,
        'staff',
        NEW.assigned_to,
        'in_app',
        jsonb_build_object('ticket_number', NEW.ticket_number, 'from_status', OLD.status, 'to_status', NEW.status)
      );
    END IF;
  END IF;

  -- Escalation transitions: notify manager email and assigned staff in-app.
  IF NEW.is_escalated IS DISTINCT FROM OLD.is_escalated AND NEW.is_escalated = true THEN
    INSERT INTO public.complaint_notifications (
      dealer_code, complaint_id, event_type, recipient_type, channel, payload
    ) VALUES (
      NEW.dealer_code,
      NEW.id,
      'escalated',
      'manager',
      'email',
      jsonb_build_object('ticket_number', NEW.ticket_number, 'reason', NEW.escalation_reason)
    );

    IF NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.complaint_notifications (
        dealer_code, complaint_id, event_type, recipient_type, recipient_user_id, channel, payload
      ) VALUES (
        NEW.dealer_code,
        NEW.id,
        'escalated',
        'staff',
        NEW.assigned_to,
        'in_app',
        jsonb_build_object('ticket_number', NEW.ticket_number, 'reason', NEW.escalation_reason)
      );
    END IF;
  END IF;

  -- Reassignment: notify newly assigned staff in-app and by email when possible.
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    IF NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.complaint_notifications (
        dealer_code, complaint_id, event_type, recipient_type, recipient_user_id, channel, payload
      ) VALUES (
        NEW.dealer_code,
        NEW.id,
        'reassigned',
        'staff',
        NEW.assigned_to,
        'in_app',
        jsonb_build_object('ticket_number', NEW.ticket_number, 'assigned_to', NEW.assigned_to)
      );
    END IF;

    SELECT u.email INTO v_assigned_email
    FROM public.users u
    WHERE u.id = NEW.assigned_to;

    IF v_assigned_email IS NOT NULL THEN
      INSERT INTO public.complaint_notifications (
        dealer_code, complaint_id, event_type, recipient_type, recipient_email, channel, payload
      ) VALUES (
        NEW.dealer_code,
        NEW.id,
        'reassigned',
        'staff',
        v_assigned_email,
        'email',
        jsonb_build_object('ticket_number', NEW.ticket_number, 'assigned_to', NEW.assigned_to)
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'complaint_notifications outbox write skipped: %', SQLERRM;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_complaint_notifications(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_include_dismissed boolean DEFAULT false
)
RETURNS TABLE (
  id bigint,
  complaint_id bigint,
  event_type text,
  recipient_type text,
  channel text,
  status text,
  payload jsonb,
  created_at timestamptz,
  seen_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    n.id,
    n.complaint_id,
    n.event_type,
    n.recipient_type,
    n.channel,
    n.status,
    n.payload,
    n.created_at,
    n.seen_at,
    n.read_at,
    n.dismissed_at
  FROM public.complaint_notifications n
  WHERE n.recipient_user_id = auth.uid()
    AND n.channel = 'in_app'
    AND (p_include_dismissed OR n.dismissed_at IS NULL)
  ORDER BY n.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.get_unread_complaint_notification_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COUNT(*)::integer
  FROM public.complaint_notifications n
  WHERE n.recipient_user_id = auth.uid()
    AND n.channel = 'in_app'
    AND n.read_at IS NULL
    AND n.dismissed_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.mark_complaint_notification_read(p_notification_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.complaint_notifications
  SET
    seen_at = COALESCE(seen_at, now()),
    read_at = COALESCE(read_at, now())
  WHERE id = p_notification_id
    AND recipient_user_id = auth.uid()
    AND channel = 'in_app';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'updated', v_rows > 0,
    'rows', v_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_complaint_notifications_read()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.complaint_notifications
  SET
    seen_at = COALESCE(seen_at, now()),
    read_at = COALESCE(read_at, now())
  WHERE recipient_user_id = auth.uid()
    AND channel = 'in_app'
    AND read_at IS NULL
    AND dismissed_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'updated_rows', v_rows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_complaint_notifications(integer, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_complaint_notification_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_complaint_notification_read(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_complaint_notifications_read() TO authenticated;

COMMIT;
