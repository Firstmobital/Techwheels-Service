-- Event-driven push notifications for customer mobile app (survey/estimate, approvals, delivery, gate pass, invoice).

CREATE TABLE IF NOT EXISTS public.customer_push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  token_id uuid NOT NULL REFERENCES public.device_push_tokens(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT customer_push_outbox_status_check CHECK (
    status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'failed'::text])
  ),
  CONSTRAINT customer_push_outbox_event_token_uidx UNIQUE (event_key, token_id)
);

CREATE INDEX IF NOT EXISTS customer_push_outbox_pending_idx
  ON public.customer_push_outbox (created_at)
  WHERE status = 'pending';

ALTER TABLE public.customer_push_outbox ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.customer_push_resolve_phone_10(
  p_reg_number text,
  p_customer_phone text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(
    NULLIF(public.customer_last10_digits(p_customer_phone), ''),
    (
      SELECT s.owner_phone
      FROM public.service_reception_entries s
      WHERE public.customer_norm_reg(s.reg_number) = public.customer_norm_reg(p_reg_number)
        AND s.owner_phone ~ '^[0-9]{10}$'
      ORDER BY s.created_at DESC
      LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.enqueue_customer_push(
  p_phone_10 text,
  p_event_key text,
  p_title text,
  p_body text,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_phone text := NULLIF(btrim(COALESCE(p_phone_10, '')), '');
  v_key text := NULLIF(btrim(COALESCE(p_event_key, '')), '');
BEGIN
  IF v_phone IS NULL OR v_phone !~ '^[0-9]{10}$' OR v_key IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.customer_push_outbox (event_key, token_id, title, body, data)
  SELECT
    v_key,
    t.id,
    left(btrim(COALESCE(p_title, 'Techwheels')), 120),
    left(btrim(COALESCE(p_body, '')), 240),
    COALESCE(p_data, '{}'::jsonb)
  FROM public.device_push_tokens t
  WHERE t.audience = 'customer'
    AND t.is_active
    AND t.phone_10 = v_phone
  ON CONFLICT (event_key, token_id) DO NOTHING;

  BEGIN
    PERFORM public.invoke_send_chat_push();
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_customer_push_outbox(p_limit integer DEFAULT 40)
RETURNS TABLE(
  id uuid,
  token_id uuid,
  title text,
  body text,
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
    FROM public.customer_push_outbox o
    WHERE o.status = 'pending'
    ORDER BY o.created_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 40), 100))
    FOR UPDATE OF o SKIP LOCKED
  ),
  updated AS (
    UPDATE public.customer_push_outbox o
    SET status = 'sending'
    FROM claimed c
    WHERE o.id = c.id
    RETURNING o.id, o.token_id, o.title, o.body, o.data
  )
  SELECT u.id, u.token_id, u.title, u.body, u.data, t.device_token, t.token_provider
  FROM updated u
  JOIN public.device_push_tokens t ON t.id = u.token_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_customer_push_outbox(
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

  UPDATE public.customer_push_outbox
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

CREATE OR REPLACE FUNCTION public.trg_customer_push_bodyshop_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_card public.bodyshop_repair_cards%ROWTYPE;
  v_phone text;
  v_reg text;
  v_route text;
  v_title text;
  v_body text;
  v_key text;
  v_data jsonb;
  v_pending_survey boolean;
  v_pending_estimate boolean;
BEGIN
  IF NEW.doc_key NOT IN ('doc_survey_approval', 'doc_estimate') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.storage_path IS NOT DISTINCT FROM NEW.storage_path
       AND OLD.file_name IS NOT DISTINCT FROM NEW.file_name
       AND COALESCE(OLD.drive_url, '') IS NOT DISTINCT FROM COALESCE(NEW.drive_url, '') THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT b.* INTO v_card FROM public.bodyshop_repair_cards b WHERE b.id = NEW.repair_card_id;
  IF NOT FOUND OR v_card.overall_status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  v_reg := COALESCE(NULLIF(btrim(NEW.reg_number), ''), NULLIF(btrim(v_card.reg_number), ''), '');
  v_phone := public.customer_push_resolve_phone_10(v_reg, v_card.customer_phone);
  IF v_phone IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.doc_key = 'doc_survey_approval' THEN
    v_route := 'survey-approval';
    v_pending_survey := COALESCE(v_card.customer_survey_approval_status, 'pending') IN ('pending', 'rejected');
    IF v_pending_survey THEN
      v_title := 'Survey approval needed';
      v_body := format('Review and approve the survey document for %s.', v_reg);
      v_key := format('survey_approval:%s:%s', NEW.repair_card_id, md5(COALESCE(NEW.storage_path, NEW.drive_url, NEW.id::text)));
    ELSE
      v_title := 'New survey document';
      v_body := format('A survey document was uploaded for %s.', v_reg);
      v_key := format('survey_doc:%s:%s', NEW.repair_card_id, md5(COALESCE(NEW.storage_path, NEW.drive_url, NEW.id::text)));
    END IF;
  ELSE
    v_route := 'estimate';
    v_pending_estimate := v_card.current_stage >= 6
      AND v_card.current_stage <= 7
      AND COALESCE(v_card.customer_approved, false) = false;
    IF v_pending_estimate THEN
      v_title := 'Estimate approval needed';
      v_body := format('Review and approve the service estimate for %s.', v_reg);
      v_key := format('estimate_approval:%s:%s', NEW.repair_card_id, md5(COALESCE(NEW.storage_path, NEW.drive_url, NEW.id::text)));
    ELSE
      v_title := 'New service estimate';
      v_body := format('A service estimate is available for %s.', v_reg);
      v_key := format('estimate_doc:%s:%s', NEW.repair_card_id, md5(COALESCE(NEW.storage_path, NEW.drive_url, NEW.id::text)));
    END IF;
  END IF;

  v_data := jsonb_build_object(
    'audience', 'customer',
    'route', v_route,
    'reg_number', v_reg,
    'kind', CASE WHEN NEW.doc_key = 'doc_survey_approval' THEN 'survey' ELSE 'service_estimate' END
  );

  PERFORM public.enqueue_customer_push(v_phone, v_key, v_title, v_body, v_data);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bodyshop_repair_card_documents_customer_push_trg
  ON public.bodyshop_repair_card_documents;

CREATE TRIGGER bodyshop_repair_card_documents_customer_push_trg
  AFTER INSERT OR UPDATE ON public.bodyshop_repair_card_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_customer_push_bodyshop_document();

CREATE OR REPLACE FUNCTION public.trg_customer_push_repair_card_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_phone text;
  v_reg text;
  v_data jsonb;
BEGIN
  IF NEW.overall_status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  v_reg := NULLIF(btrim(COALESCE(NEW.reg_number, '')), '');
  v_phone := public.customer_push_resolve_phone_10(v_reg, NEW.customer_phone);

  IF OLD.current_stage IS DISTINCT FROM NEW.current_stage
     AND COALESCE(OLD.current_stage, 0) < 17
     AND NEW.current_stage >= 17
     AND v_phone IS NOT NULL THEN
    v_data := jsonb_build_object(
      'audience', 'customer',
      'route', 'tracker',
      'reg_number', v_reg,
      'kind', 'ready_for_delivery'
    );
    PERFORM public.enqueue_customer_push(
      v_phone,
      format('ready_delivery:%s:stage17', NEW.id),
      'Ready for delivery',
      format('Your vehicle %s is in the delivery stage. Tap for journey updates.', v_reg),
      v_data
    );
  END IF;

  IF OLD.current_stage IS DISTINCT FROM NEW.current_stage
     AND COALESCE(OLD.current_stage, 0) < 15
     AND NEW.current_stage >= 15
     AND v_phone IS NOT NULL THEN
    v_data := jsonb_build_object(
      'audience', 'customer',
      'route', 'invoices',
      'reg_number', v_reg,
      'kind', 'invoice_ready'
    );
    PERFORM public.enqueue_customer_push(
      v_phone,
      format('invoice_ready_bodyshop:%s:stage15', NEW.id),
      'Invoice / billing ready',
      format('Billing is ready for %s. View payment details in the app.', v_reg),
      v_data
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bodyshop_repair_cards_customer_push_trg ON public.bodyshop_repair_cards;

CREATE TRIGGER bodyshop_repair_cards_customer_push_trg
  AFTER UPDATE OF current_stage ON public.bodyshop_repair_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_customer_push_repair_card_stage();

CREATE OR REPLACE FUNCTION public.trg_customer_push_reception_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_phone text;
  v_reg text;
  v_data jsonb;
BEGIN
  v_reg := NULLIF(btrim(COALESCE(NEW.reg_number, '')), '');
  v_phone := NULLIF(btrim(COALESCE(NEW.owner_phone, '')), '');
  IF v_phone IS NULL OR v_phone !~ '^[0-9]{10}$' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.gate_pass_issued, false) = false AND COALESCE(NEW.gate_pass_issued, false) = true THEN
    v_data := jsonb_build_object(
      'audience', 'customer',
      'route', 'gatepass',
      'reg_number', v_reg,
      'kind', 'gate_pass'
    );
    PERFORM public.enqueue_customer_push(
      v_phone,
      format('gate_pass:%s:%s', NEW.id, COALESCE(NEW.gate_pass_number, 'issued')),
      'Gate pass ready',
      format('Your gate pass for %s is ready. Tap to view before pickup.', v_reg),
      v_data
    );
  END IF;

  IF (OLD.invoice_done_at IS NULL AND NEW.invoice_done_at IS NOT NULL)
     OR (
       NULLIF(btrim(COALESCE(OLD.invoice_drive_url, '')), '') IS NULL
       AND NULLIF(btrim(COALESCE(NEW.invoice_drive_url, '')), '') IS NOT NULL
     ) THEN
    v_data := jsonb_build_object(
      'audience', 'customer',
      'route', 'invoices',
      'reg_number', v_reg,
      'kind', 'invoice_ready'
    );
    PERFORM public.enqueue_customer_push(
      v_phone,
      format('invoice_ready_mech:%s:%s', NEW.id, COALESCE(NEW.invoice_done_at::text, NEW.invoice_drive_url, '1')),
      'Invoice ready',
      format('Your invoice for %s is ready. Tap to view bills and payments.', v_reg),
      v_data
    );
  END IF;

  IF NULLIF(btrim(COALESCE(OLD.estimate_drive_url, '')), '') IS NULL
     AND NULLIF(btrim(COALESCE(NEW.estimate_drive_url, '')), '') IS NOT NULL THEN
    v_data := jsonb_build_object(
      'audience', 'customer',
      'route', 'estimate',
      'reg_number', v_reg,
      'kind', 'service_estimate'
    );
    PERFORM public.enqueue_customer_push(
      v_phone,
      format('mech_estimate:%s:%s', NEW.id, md5(NEW.estimate_drive_url)),
      'Estimate approval needed',
      format('Review the service estimate for %s.', v_reg),
      v_data
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_reception_entries_customer_push_trg ON public.service_reception_entries;

CREATE TRIGGER service_reception_entries_customer_push_trg
  AFTER UPDATE OF gate_pass_issued, gate_pass_number, invoice_done_at, invoice_drive_url, estimate_drive_url
  ON public.service_reception_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_customer_push_reception_entry();

REVOKE ALL ON FUNCTION public.claim_customer_push_outbox(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_customer_push_outbox(integer) TO service_role;

REVOKE ALL ON FUNCTION public.complete_customer_push_outbox(uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_customer_push_outbox(uuid, text, text, boolean) TO service_role;
