-- Reception delete was callable by any authenticated user.
-- delete_reception_entry_cascade is SECURITY DEFINER, so it bypasses
-- service_reception_delete_rbac (is_admin OR has_module_delete('reception')).
-- Match create/update reception RPCs and the table DELETE policy.
-- Safe to re-run.

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
  v_dealer_code            text;
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
    invoice_storage_path,
    dealer_code
  INTO
    v_jc_number,
    v_reg_number,
    v_estimate_storage_path,
    v_invoice_storage_path,
    v_dealer_code
  FROM public.service_reception_entries
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reception entry % not found', p_id;
  END IF;

  IF NOT (
    public.is_admin()
    OR (
      public.has_module_delete('reception')
      AND public.dealer_code_in_scope(v_dealer_code)
    )
  ) THEN
    RAISE EXCEPTION 'permission denied: requires reception delete or admin'
      USING ERRCODE = '42501';
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
        'Cannot delete: bodyshop repair card has a real DMS job card assigned (%). Cancel the bodyshop repair first, then delete this entry.',
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

COMMENT ON FUNCTION public.delete_reception_entry_cascade(bigint) IS
  'Deletes a service_reception_entries row and dependents. '
  'Requires admin or reception delete in dealer scope. '
  'Blocks if a bodyshop repair card has a real DMS JC unless that card is cancelled.';

REVOKE ALL ON FUNCTION public.delete_reception_entry_cascade(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_reception_entry_cascade(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_reception_entry_cascade(bigint) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
