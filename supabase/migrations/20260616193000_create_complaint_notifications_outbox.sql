-- Complaints notifications outbox pipeline
--
-- Purpose:
--   Create a durable outbox for complaint notification events and write events
--   automatically from complaint ticket lifecycle changes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.complaint_notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dealer_code text NOT NULL DEFAULT public.my_dealer_code(),
  complaint_id bigint NOT NULL REFERENCES public.complaint_tickets(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  recipient_type text NOT NULL,
  recipient_email text,
  recipient_phone text,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb,
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT complaint_notifications_event_type_check
    CHECK (event_type = ANY (ARRAY['raised','acknowledged','in_progress','resolved','closed','escalated','reopened','reassigned'])),
  CONSTRAINT complaint_notifications_recipient_type_check
    CHECK (recipient_type = ANY (ARRAY['customer','staff','manager'])),
  CONSTRAINT complaint_notifications_channel_check
    CHECK (channel = ANY (ARRAY['sms','email','whatsapp'])),
  CONSTRAINT complaint_notifications_status_check
    CHECK (status = ANY (ARRAY['pending','sent','failed','skipped']))
);

CREATE INDEX IF NOT EXISTS ix_complaint_notifications_complaint
  ON public.complaint_notifications (complaint_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_complaint_notifications_pending
  ON public.complaint_notifications (status, created_at)
  WHERE status = 'pending';

ALTER TABLE public.complaint_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS complaint_notifications_select ON public.complaint_notifications;
CREATE POLICY complaint_notifications_select
ON public.complaint_notifications
FOR SELECT
TO authenticated
USING (public.is_admin() OR public.dealer_code_in_scope(dealer_code));

DROP POLICY IF EXISTS complaint_notifications_service_role_all ON public.complaint_notifications;
CREATE POLICY complaint_notifications_service_role_all
ON public.complaint_notifications
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.trg_cn_write_notifications_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_assigned_email text;
BEGIN
  -- New complaint raised: notify assigned staff (email) and customer (sms).
  IF TG_OP = 'INSERT' THEN
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

  -- Status transitions: notify customer.
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
  END IF;

  -- Escalation transitions: notify manager channel (email deferred).
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
  END IF;

  -- Reassignment: notify newly assigned staff when possible.
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
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
    -- Outbox writes should not block complaint updates.
    RAISE NOTICE 'complaint_notifications outbox write skipped: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cn_write_notifications ON public.complaint_tickets;
CREATE TRIGGER trg_cn_write_notifications
AFTER INSERT OR UPDATE OF status, is_escalated, assigned_to
ON public.complaint_tickets
FOR EACH ROW
EXECUTE FUNCTION public.trg_cn_write_notifications_fn();

COMMENT ON TABLE public.complaint_notifications IS 'Outbox for complaint lifecycle notification events (customer/staff/manager).';

COMMIT;
