-- Batch-update customer_estimate_payload bot rows (one round trip from mobile).
CREATE OR REPLACE FUNCTION public.customer_batch_sync_estimate_payloads(
  p_session_token text,
  p_reg_number text,
  p_status text,
  p_reason text DEFAULT NULL,
  p_approved_at timestamptz DEFAULT NULL,
  p_updated_at timestamptz DEFAULT NULL,
  p_items jsonb DEFAULT NULL,
  p_subtotal numeric DEFAULT NULL,
  p_gst_tax numeric DEFAULT NULL,
  p_grand_total numeric DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_sess record;
  v_reg text;
  v_row record;
  v_parsed jsonb;
  v_updated int := 0;
  v_now timestamptz := coalesce(p_updated_at, now());
BEGIN
  SELECT * INTO v_sess FROM public.customer_require_session(p_session_token);
  v_reg := public.customer_assert_reg(p_session_token, p_reg_number);

  FOR v_row IN
    SELECT b.id, b.feedback_text
    FROM public.post_feedback_bot_data b
    WHERE b.mode = 'customer_estimate_payload'
      AND public.customer_norm_reg(b.vehicle_registration_number) = v_reg
      AND b.feedback_text ~ '^\s*\{'
  LOOP
    BEGIN
      v_parsed := v_row.feedback_text::jsonb;
      v_parsed := v_parsed
        || jsonb_build_object(
          'status', p_status,
          'updated_at', to_jsonb(v_now)
        );
      IF p_reason IS NOT NULL THEN
        v_parsed := v_parsed || jsonb_build_object('rejection_reason', p_reason);
      END IF;
      IF p_approved_at IS NOT NULL THEN
        v_parsed := v_parsed || jsonb_build_object('approved_at', to_jsonb(p_approved_at));
      END IF;
      IF p_items IS NOT NULL THEN
        v_parsed := v_parsed || jsonb_build_object('items', p_items);
      END IF;
      IF p_subtotal IS NOT NULL THEN
        v_parsed := v_parsed || jsonb_build_object('subtotal', to_jsonb(p_subtotal));
      END IF;
      IF p_gst_tax IS NOT NULL THEN
        v_parsed := v_parsed || jsonb_build_object('gst_tax', to_jsonb(p_gst_tax));
      END IF;
      IF p_grand_total IS NOT NULL THEN
        v_parsed := v_parsed || jsonb_build_object(
          'grand_total', to_jsonb(p_grand_total),
          'final_amount', to_jsonb(p_grand_total)
        );
      END IF;

      UPDATE public.post_feedback_bot_data
      SET feedback_text = v_parsed::text,
          complaint_date_time = v_now::text
      WHERE id = v_row.id;

      v_updated := v_updated + 1;
    EXCEPTION
      WHEN others THEN
        NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'updated', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.customer_batch_sync_estimate_payloads(
  text, text, text, text, timestamptz, timestamptz, jsonb, numeric, numeric, numeric
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_batch_sync_estimate_payloads(
  text, text, text, text, timestamptz, timestamptz, jsonb, numeric, numeric, numeric
) TO anon;
GRANT EXECUTE ON FUNCTION public.customer_batch_sync_estimate_payloads(
  text, text, text, text, timestamptz, timestamptz, jsonb, numeric, numeric, numeric
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_batch_sync_estimate_payloads(
  text, text, text, text, timestamptz, timestamptz, jsonb, numeric, numeric, numeric
) TO service_role;

CREATE INDEX IF NOT EXISTS idx_post_feedback_bot_reg_mode
  ON public.post_feedback_bot_data (vehicle_registration_number, mode);
