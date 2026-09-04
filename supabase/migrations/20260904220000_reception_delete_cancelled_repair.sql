-- Reception delete after Cancel repair + hide cancelled from Recovery book.
-- delete_reception_entry_cascade already said "cancel the bodyshop repair"
-- but never allowed cancelled cards through. Timestamp 20260904220000.
-- Do not re-run DBL-0032. Safe to re-run.

CREATE OR REPLACE FUNCTION public.delete_reception_entry_cascade(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_jc_number              text;
  v_reg_number             text;
  v_estimate_storage_path  text;
  v_invoice_storage_path   text;
  v_repair_card_id         integer;
  v_repair_card_job_card_no text;
  v_repair_card_reg_number  text;
  v_repair_card_status      text;
  v_intake_photo_paths     text[];
BEGIN
  SELECT
    jc_number,
    reg_number,
    estimate_storage_path,
    invoice_storage_path
  INTO
    v_jc_number,
    v_reg_number,
    v_estimate_storage_path,
    v_invoice_storage_path
  FROM public.service_reception_entries
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reception entry % not found', p_id;
  END IF;

  SELECT id, job_card_no, reg_number, overall_status
  INTO v_repair_card_id, v_repair_card_job_card_no, v_repair_card_reg_number, v_repair_card_status
  FROM public.bodyshop_repair_cards
  WHERE reception_entry_id = p_id
  LIMIT 1;

  IF FOUND THEN
    IF lower(btrim(COALESCE(v_repair_card_status, ''))) = 'cancelled' THEN
      NULL;
    ELSIF upper(btrim(v_repair_card_job_card_no)) IS DISTINCT FROM
          upper(btrim(COALESCE(v_repair_card_reg_number, '')))
          AND btrim(v_repair_card_job_card_no) <> ''
    THEN
      RAISE EXCEPTION
        'Cannot delete: bodyshop repair card has a DMS job card assigned (%). Cancel the bodyshop repair first, then delete this entry.',
        v_repair_card_job_card_no;
    END IF;

    SELECT array_agg(storage_path)
    INTO v_intake_photo_paths
    FROM public.bodyshop_intake_vehicle_photos
    WHERE repair_card_id = v_repair_card_id;

    DELETE FROM public.bodyshop_repair_cards WHERE id = v_repair_card_id;
  END IF;

  IF v_jc_number IS NOT NULL AND btrim(v_jc_number) <> '' THEN
    DELETE FROM public.technician_assignments
    WHERE job_card_number = v_jc_number;

    DELETE FROM public.job_card_support_assignments
    WHERE job_card_number = v_jc_number;

    DELETE FROM public.bodyshop_floor_support_assignments
    WHERE job_card_number = v_jc_number;
  END IF;

  DELETE FROM public.service_reception_entries WHERE id = p_id;

  RETURN jsonb_build_object(
    'deleted_id',             p_id,
    'estimate_storage_path',  v_estimate_storage_path,
    'invoice_storage_path',   v_invoice_storage_path,
    'intake_photo_paths',     COALESCE(to_jsonb(v_intake_photo_paths), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_bodyshop_do_recovery()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security = off
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT (
    public.is_admin()
    OR public.has_module_view('bodyshop_recovery')
    OR public.has_module_modify('bodyshop_recovery')
  ) THEN
    RAISE EXCEPTION 'permission denied: requires bodyshop_recovery view'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.insurance_due_amount DESC, x.invoice_date DESC NULLS LAST, x.repair_card_id DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT
        s.repair_card_id,
        s.job_card_no,
        c.reg_number,
        c.customer_name,
        c.branch,
        c.sa_name,
        c.insurance_company,
        c.overall_status,
        c.current_stage,
        s.invoice_number,
        s.invoice_date,
        s.invoice_amount,
        s.invoice_account,
        s.do_amount,
        s.do_released_amount,
        s.insurance_due_amount,
        s.do_payment_status,
        s.needs_accounts_review
      FROM public.bodyshop_settlements s
      JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
      WHERE s.do_amount IS NOT NULL
        AND COALESCE(s.insurance_due_amount, 0) > 0
        AND COALESCE(c.overall_status, 'active') <> 'cancelled'
    ) x;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.delete_reception_entry_cascade(bigint) IS
  'Deletes a service_reception_entries row and dependents. '
  'Blocks if a bodyshop repair card has a real DMS JC unless that card is cancelled.';

GRANT EXECUTE ON FUNCTION public.delete_reception_entry_cascade(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_bodyshop_do_recovery() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
