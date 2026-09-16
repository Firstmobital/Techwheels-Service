-- DBL-0069
-- Service Advisor invoice amount / invoice_done_at only when Floor Incharge
-- has work_status = completed on the JC.
--
-- Restores the old Mark Done gate: incomplete Floor jobs must not capture
-- expected_invoice_amount or complete Accounts.
--
-- Rules:
--   * Accident / Rusting still never auto-complete; their amount is cleared.
--   * Blank/NULL amount still does not complete.
--   * Explicit 0 is allowed only on a completed Floor JC.
--   * Later amount edits still do not rewrite invoice_done_at.
--   * Incomplete saves of service_type / jc_number / km / remark still work
--     and do not overwrite a previously stored amount.

CREATE OR REPLACE FUNCTION public.service_advisor_save_reception_entry(
  p_reception_entry_id bigint,
  p_service_type       text,
  p_jc_number          text    DEFAULT NULL,
  p_km_reading         integer DEFAULT NULL,
  p_remark             text    DEFAULT NULL,
  p_expected_invoice_amount numeric DEFAULT NULL,
  p_set_expected_invoice_amount boolean DEFAULT false
)
RETURNS SETOF public.service_reception_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sa_employee_code text;
  v_is_admin         boolean;
  v_has_sa_modify    boolean;
  v_service_type     text;
  v_amount           numeric;
  v_done_by          text;
  v_can_complete     boolean;
  v_jc               text;
  v_floor_completed  boolean;
  v_is_invoice_exception boolean;
BEGIN
  v_service_type := btrim(coalesce(p_service_type, ''));
  IF v_service_type = '' THEN
    RAISE EXCEPTION 'service_type is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_expected_invoice_amount IS NOT NULL AND p_expected_invoice_amount < 0 THEN
    RAISE EXCEPTION 'expected_invoice_amount cannot be negative'
      USING ERRCODE = '23514';
  END IF;

  v_is_admin      := public.is_admin();
  v_has_sa_modify := public.has_module_modify('service_advisor');

  IF NOT (v_is_admin OR v_has_sa_modify) THEN
    RAISE EXCEPTION 'permission denied: requires service_advisor modify or admin'
      USING ERRCODE = '42501';
  END IF;

  SELECT sre.sa_employee_code
    INTO v_sa_employee_code
    FROM public.service_reception_entries sre
   WHERE sre.id = p_reception_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reception entry % not found', p_reception_entry_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_is_admin THEN
    IF v_sa_employee_code IS NULL
       OR NOT public.user_has_employee_code(v_sa_employee_code)
    THEN
      RAISE EXCEPTION 'permission denied: caller is not the SA on this reception entry'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_is_invoice_exception := lower(v_service_type) IN ('accident', 'rusting');

  IF v_is_invoice_exception THEN
    v_amount := NULL;
  ELSE
    v_amount := CASE
      WHEN p_expected_invoice_amount IS NULL THEN NULL
      ELSE round(p_expected_invoice_amount, 2)
    END;
  END IF;

  v_jc := NULLIF(upper(btrim(coalesce(p_jc_number, ''))), '');
  IF v_jc IS NULL THEN
    SELECT NULLIF(upper(btrim(coalesce(sre.jc_number, ''))), '')
      INTO v_jc
      FROM public.service_reception_entries sre
     WHERE sre.id = p_reception_entry_id;
  END IF;

  v_floor_completed := v_jc IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.technician_assignments ta
     WHERE upper(btrim(ta.job_card_number)) = v_jc
       AND lower(btrim(coalesce(ta.work_status, ''))) = 'completed'
  );

  -- Qualifying completion: explicit persisted amount on a Floor-completed JC.
  -- 0 is valid (column CHECK >= 0). NULL / blank does not complete.
  v_can_complete := p_set_expected_invoice_amount
    AND v_amount IS NOT NULL
    AND NOT v_is_invoice_exception
    AND v_floor_completed;

  v_done_by := coalesce(
    nullif(btrim(auth.jwt() ->> 'email'), ''),
    auth.uid()::text,
    'system'
  );

  UPDATE public.service_reception_entries sre
     SET service_type = v_service_type,
         jc_number    = NULLIF(upper(btrim(coalesce(p_jc_number, ''))), ''),
         km_reading   = p_km_reading,
         remark       = NULLIF(btrim(coalesce(p_remark, '')), ''),
         expected_invoice_amount = CASE
           WHEN p_set_expected_invoice_amount AND v_is_invoice_exception THEN NULL
           WHEN p_set_expected_invoice_amount AND v_floor_completed THEN v_amount
           ELSE sre.expected_invoice_amount
         END,
         invoice_done_at = CASE
           WHEN v_can_complete AND sre.invoice_done_at IS NULL THEN now()
           ELSE sre.invoice_done_at
         END,
         invoice_done_by = CASE
           WHEN v_can_complete AND sre.invoice_done_at IS NULL THEN v_done_by
           ELSE sre.invoice_done_by
         END,
         updated_at   = now()
   WHERE sre.id = p_reception_entry_id;

  IF p_set_expected_invoice_amount AND (v_floor_completed OR v_is_invoice_exception) THEN
    PERFORM public.service_advisor_seed_mechanical_billed_amount(p_reception_entry_id, v_amount);
  END IF;

  RETURN QUERY
  SELECT sre.*
    FROM public.service_reception_entries sre
   WHERE sre.id = p_reception_entry_id;
END;
$$;

COMMENT ON FUNCTION public.service_advisor_save_reception_entry(
  bigint, text, text, integer, text, numeric, boolean
)
IS 'SECURITY DEFINER RPC: updates service_type, jc_number, km_reading, remark, and optionally expected_invoice_amount. '
   'DBL-0069: expected_invoice_amount and invoice_done_at require Floor Incharge work_status=completed on the JC. '
   'Accident/Rusting never auto-complete. Blank amount does not complete. Later amount edits do not rewrite the original timestamp. '
   'Seeds accounts_mechanical_invoices.billed_amount when JC exists and Accounts has not captured.';

NOTIFY pgrst, 'reload schema';
