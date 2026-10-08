-- Customer approves/rejects advisor-uploaded survey approval document (mobile app).

ALTER TABLE public.bodyshop_repair_cards
  ADD COLUMN IF NOT EXISTS customer_survey_approval_status text,
  ADD COLUMN IF NOT EXISTS customer_survey_rejection_reason text,
  ADD COLUMN IF NOT EXISTS customer_survey_decided_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS doc_survey_approval boolean;

ALTER TABLE public.bodyshop_repair_cards
  DROP CONSTRAINT IF EXISTS bodyshop_repair_cards_customer_survey_approval_status_check;

ALTER TABLE public.bodyshop_repair_cards
  ADD CONSTRAINT bodyshop_repair_cards_customer_survey_approval_status_check
  CHECK (
    customer_survey_approval_status IS NULL
    OR customer_survey_approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])
  );

CREATE OR REPLACE FUNCTION public.customer_set_survey_approval_decision(
  p_session_token text,
  p_reg_number text,
  p_decision text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
SET row_security TO off
AS $$
DECLARE
  v_sess record;
  v_reg text;
  v_regs text[];
  v_card public.bodyshop_repair_cards%rowtype;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_has_doc boolean := false;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_sess FROM public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);
  v_reg := public.customer_assert_reg(p_session_token, p_reg_number);

  IF v_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'decision must be approve or reject';
  END IF;

  IF v_decision = 'reject' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  SELECT b.*
  INTO v_card
  FROM public.bodyshop_repair_cards b
  WHERE public.customer_norm_reg(b.reg_number) = ANY (v_regs)
    AND public.customer_norm_reg(b.reg_number) = v_reg
    AND b.overall_status = 'active'
  ORDER BY b.updated_at DESC, b.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active repair card not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.bodyshop_repair_card_documents d
    WHERE d.repair_card_id = v_card.id
      AND d.doc_key = 'doc_survey_approval'
  ) INTO v_has_doc;

  IF NOT v_has_doc THEN
    RAISE EXCEPTION 'Survey approval document is not available yet';
  END IF;

  IF coalesce(v_card.customer_survey_approval_status, 'pending') NOT IN ('pending', 'rejected') THEN
    IF v_decision = 'approve' AND v_card.customer_survey_approval_status = 'approved' THEN
      RETURN jsonb_build_object('ok', true, 'status', 'approved', 'already', true);
    END IF;
    IF v_card.customer_survey_approval_status = 'approved' AND v_decision = 'reject' THEN
      RAISE EXCEPTION 'Survey approval is already accepted';
    END IF;
  END IF;

  IF v_decision = 'approve' THEN
    UPDATE public.bodyshop_repair_cards
    SET
      customer_survey_approval_status = 'approved',
      customer_survey_rejection_reason = NULL,
      customer_survey_decided_at = v_now,
      doc_survey_approval = true,
      updated_at = v_now
    WHERE id = v_card.id;
  ELSE
    UPDATE public.bodyshop_repair_cards
    SET
      customer_survey_approval_status = 'rejected',
      customer_survey_rejection_reason = v_reason,
      customer_survey_decided_at = v_now,
      doc_survey_approval = false,
      updated_at = v_now
    WHERE id = v_card.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', CASE WHEN v_decision = 'approve' THEN 'approved' ELSE 'rejected' END,
    'reason', CASE WHEN v_decision = 'reject' THEN v_reason ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_set_survey_approval_decision(text, text, text, text) TO anon, authenticated, service_role;
