-- Customer-visible history when survey / service estimate documents change or customer decides.

CREATE TABLE IF NOT EXISTS public.customer_portal_approval_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_card_id bigint REFERENCES public.bodyshop_repair_cards(id) ON DELETE SET NULL,
  reg_number text,
  approval_kind text NOT NULL CHECK (approval_kind IN ('survey', 'service_estimate')),
  event_type text NOT NULL CHECK (
    event_type IN (
      'document_replaced',
      'customer_approved',
      'customer_rejected'
    )
  ),
  doc_key text,
  file_name text,
  storage_bucket text,
  storage_path text,
  drive_url text,
  document_uploaded_at timestamptz,
  customer_decision text,
  customer_reason text,
  estimate_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_portal_approval_history_reg_kind
  ON public.customer_portal_approval_history (reg_number, approval_kind, created_at DESC);

ALTER TABLE public.customer_portal_approval_history ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.trg_bodyshop_doc_archive_customer_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.doc_key IN ('doc_survey_approval', 'doc_estimate') THEN
    IF OLD.storage_path IS DISTINCT FROM NEW.storage_path
       OR OLD.file_name IS DISTINCT FROM NEW.file_name
       OR COALESCE(OLD.drive_url, '') IS DISTINCT FROM COALESCE(NEW.drive_url, '') THEN
      INSERT INTO public.customer_portal_approval_history (
        repair_card_id,
        reg_number,
        approval_kind,
        event_type,
        doc_key,
        file_name,
        storage_bucket,
        storage_path,
        drive_url,
        document_uploaded_at,
        metadata
      ) VALUES (
        OLD.repair_card_id,
        OLD.reg_number,
        CASE WHEN OLD.doc_key = 'doc_survey_approval' THEN 'survey' ELSE 'service_estimate' END,
        'document_replaced',
        OLD.doc_key,
        OLD.file_name,
        OLD.storage_bucket,
        OLD.storage_path,
        OLD.drive_url,
        OLD.uploaded_at,
        jsonb_build_object('note', 'Previous version before advisor upload')
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bodyshop_repair_card_documents_customer_history_trg
  ON public.bodyshop_repair_card_documents;

CREATE TRIGGER bodyshop_repair_card_documents_customer_history_trg
  BEFORE UPDATE ON public.bodyshop_repair_card_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_bodyshop_doc_archive_customer_history();

CREATE OR REPLACE FUNCTION public.customer_list_approval_history(
  p_session_token text,
  p_reg_number text,
  p_kind text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, extensions
SET row_security TO off
AS $$
DECLARE
  v_reg text;
  v_kind text := lower(btrim(coalesce(p_kind, '')));
BEGIN
  PERFORM public.customer_require_session(p_session_token);
  v_reg := public.customer_assert_reg(p_session_token, p_reg_number);

  IF v_kind NOT IN ('survey', 'service_estimate') THEN
    RAISE EXCEPTION 'kind must be survey or service_estimate';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_data ORDER BY row_data->>'created_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', h.id,
          'event_type', h.event_type,
          'approval_kind', h.approval_kind,
          'file_name', h.file_name,
          'drive_url', h.drive_url,
          'document_uploaded_at', h.document_uploaded_at,
          'customer_decision', h.customer_decision,
          'customer_reason', h.customer_reason,
          'estimate_id', h.estimate_id,
          'created_at', h.created_at
        ) AS row_data
        FROM public.customer_portal_approval_history h
        WHERE public.customer_norm_reg(h.reg_number) = v_reg
          AND h.approval_kind = v_kind
        ORDER BY h.created_at DESC
        LIMIT 40
      ) sub
    ),
    '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_list_approval_history(text, text, text)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_bodyshop_card_log_survey_decision_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $$
DECLARE
  v_doc record;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF OLD.customer_survey_approval_status IS NOT DISTINCT FROM NEW.customer_survey_approval_status THEN
    RETURN NEW;
  END IF;
  IF NEW.customer_survey_approval_status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  SELECT d.file_name, d.storage_bucket, d.storage_path, d.drive_url, d.uploaded_at
  INTO v_doc
  FROM public.bodyshop_repair_card_documents d
  WHERE d.repair_card_id = NEW.id
    AND d.doc_key = 'doc_survey_approval'
  ORDER BY d.uploaded_at DESC NULLS LAST, d.id DESC
  LIMIT 1;

  INSERT INTO public.customer_portal_approval_history (
    repair_card_id,
    reg_number,
    approval_kind,
    event_type,
    doc_key,
    file_name,
    storage_bucket,
    storage_path,
    drive_url,
    document_uploaded_at,
    customer_decision,
    customer_reason,
    metadata
  ) VALUES (
    NEW.id,
    NEW.reg_number,
    'survey',
    CASE WHEN NEW.customer_survey_approval_status = 'approved' THEN 'customer_approved' ELSE 'customer_rejected' END,
    'doc_survey_approval',
    v_doc.file_name,
    v_doc.storage_bucket,
    v_doc.storage_path,
    v_doc.drive_url,
    v_doc.uploaded_at,
    NEW.customer_survey_approval_status,
    NEW.customer_survey_rejection_reason,
    jsonb_build_object('source', 'bodyshop_repair_cards_trigger')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bodyshop_repair_cards_survey_decision_history_trg ON public.bodyshop_repair_cards;

CREATE TRIGGER bodyshop_repair_cards_survey_decision_history_trg
  AFTER UPDATE OF customer_survey_approval_status, customer_survey_rejection_reason ON public.bodyshop_repair_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_bodyshop_card_log_survey_decision_history();

CREATE OR REPLACE FUNCTION public.trg_bot_log_estimate_decision_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $$
DECLARE
  v_card_id bigint;
  v_est_id text;
BEGIN
  IF NEW.mode NOT IN ('customer_estimate_approval', 'customer_estimate_rejection') THEN
    RETURN NEW;
  END IF;

  v_est_id := coalesce((NEW.feedback_text)::jsonb->>'estimate_no', NULL);
  IF v_est_id IS NULL THEN
    v_est_id := substring(NEW.feedback_text from 'Estimate #([^ ]+)');
  END IF;

  SELECT b.id
  INTO v_card_id
  FROM public.bodyshop_repair_cards b
  WHERE public.customer_norm_reg(b.reg_number) = public.customer_norm_reg(NEW.vehicle_registration_number)
    AND b.overall_status = 'active'
  ORDER BY b.updated_at DESC
  LIMIT 1;

  INSERT INTO public.customer_portal_approval_history (
    repair_card_id,
    reg_number,
    approval_kind,
    event_type,
    estimate_id,
    customer_decision,
    customer_reason,
    metadata
  ) VALUES (
    v_card_id,
    NEW.vehicle_registration_number,
    'service_estimate',
    CASE WHEN NEW.mode = 'customer_estimate_approval' THEN 'customer_approved' ELSE 'customer_rejected' END,
    nullif(btrim(v_est_id), ''),
    CASE WHEN NEW.mode = 'customer_estimate_approval' THEN 'approved' ELSE 'rejected' END,
    CASE
      WHEN NEW.mode = 'customer_estimate_rejection'
        THEN substring(NEW.feedback_text from 'Reason: (.*)$')
      ELSE NULL
    END,
    jsonb_build_object('bot_event_id', NEW.id, 'source', 'post_feedback_bot_data_trigger')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS post_feedback_bot_estimate_decision_history_trg ON public.post_feedback_bot_data;

CREATE TRIGGER post_feedback_bot_estimate_decision_history_trg
  AFTER INSERT ON public.post_feedback_bot_data
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_bot_log_estimate_decision_history();
