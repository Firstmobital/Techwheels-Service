-- SUPABASE-004 Phase 5: also sync rto_idspay.owner_name -> all_service_data.first_name
-- IDSPay stores the full owner name in owner_name; clear last_name on target.

DROP FUNCTION IF EXISTS public.refresh_all_service_data_from_rto_idspay(text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.refresh_all_service_data_from_rto_idspay(
  p_chassis_key text DEFAULT NULL,
  p_registration_key text DEFAULT NULL,
  p_insurance_company text DEFAULT NULL,
  p_insurance_upto text DEFAULT NULL,
  p_insurance_policy_number text DEFAULT NULL,
  p_owner_name text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_chassis_norm text;
  v_reg_norm text;
  v_company text;
  v_policy text;
  v_upto_text text;
  v_expiry date;
  v_owner_name text;
  v_target_id bigint;
  v_new_company text;
  v_new_policy text;
BEGIN
  v_chassis_norm := nullif(upper(btrim(coalesce(p_chassis_key, ''))), '');
  v_reg_norm := nullif(upper(btrim(coalesce(p_registration_key, ''))), '');

  IF v_chassis_norm IS NULL AND v_reg_norm IS NULL THEN
    RETURN;
  END IF;

  v_company := nullif(btrim(coalesce(p_insurance_company, '')), '');
  v_policy := nullif(btrim(coalesce(p_insurance_policy_number, '')), '');
  v_upto_text := nullif(btrim(coalesce(p_insurance_upto, '')), '');
  v_expiry := public.parse_all_service_date_text(v_upto_text);
  v_owner_name := nullif(btrim(coalesce(p_owner_name, '')), '');

  IF v_company IS NULL AND v_policy IS NULL AND v_expiry IS NULL AND v_owner_name IS NULL THEN
    RETURN;
  END IF;

  v_target_id := NULL;

  IF v_chassis_norm IS NOT NULL THEN
    SELECT t.id
    INTO v_target_id
    FROM public.all_service_data t
    WHERE upper(nullif(btrim(t.chassis_no), '')) = v_chassis_norm
    ORDER BY t.last_updated_at DESC NULLS LAST, t.created_at DESC NULLS LAST, t.id DESC
    LIMIT 1;
  END IF;

  IF v_target_id IS NULL AND v_reg_norm IS NOT NULL THEN
    SELECT t.id
    INTO v_target_id
    FROM public.all_service_data t
    WHERE upper(nullif(btrim(t.vehicle_registration_number), '')) = v_reg_norm
    ORDER BY t.last_updated_at DESC NULLS LAST, t.created_at DESC NULLS LAST, t.id DESC
    LIMIT 1;
  END IF;

  IF v_target_id IS NULL THEN
    RETURN;
  END IF;

  v_new_company := v_company;
  v_new_policy := v_policy;

  UPDATE public.all_service_data t
  SET
    last_insurance_comapny = COALESCE(v_new_company, t.last_insurance_comapny),
    last_insurance_policy_number = COALESCE(v_new_policy, t.last_insurance_policy_number),
    last_insurance_expiry_date = COALESCE(v_expiry, t.last_insurance_expiry_date),
    first_name = CASE WHEN v_owner_name IS NOT NULL THEN v_owner_name ELSE t.first_name END,
    last_name = CASE WHEN v_owner_name IS NOT NULL THEN NULL ELSE t.last_name END,
    updated_by_rtoids = CASE
      WHEN (
        (v_new_company IS NOT NULL AND t.last_insurance_comapny IS DISTINCT FROM v_new_company)
        OR (v_new_policy IS NOT NULL AND t.last_insurance_policy_number IS DISTINCT FROM v_new_policy)
        OR (v_expiry IS NOT NULL AND t.last_insurance_expiry_date IS DISTINCT FROM v_expiry)
      ) THEN true
      ELSE t.updated_by_rtoids
    END,
    updated_by_rtoids_at = CASE
      WHEN (
        (v_new_company IS NOT NULL AND t.last_insurance_comapny IS DISTINCT FROM v_new_company)
        OR (v_new_policy IS NOT NULL AND t.last_insurance_policy_number IS DISTINCT FROM v_new_policy)
        OR (v_expiry IS NOT NULL AND t.last_insurance_expiry_date IS DISTINCT FROM v_expiry)
      ) THEN now()
      ELSE t.updated_by_rtoids_at
    END,
    last_updated_at = now()
  WHERE t.id = v_target_id
    AND (
      (v_new_company IS NOT NULL AND t.last_insurance_comapny IS DISTINCT FROM v_new_company)
      OR (v_new_policy IS NOT NULL AND t.last_insurance_policy_number IS DISTINCT FROM v_new_policy)
      OR (v_expiry IS NOT NULL AND t.last_insurance_expiry_date IS DISTINCT FROM v_expiry)
      OR (
        v_owner_name IS NOT NULL
        AND (
          t.first_name IS DISTINCT FROM v_owner_name
          OR t.last_name IS NOT NULL
        )
      )
    );
END;
$$;

COMMENT ON FUNCTION public.refresh_all_service_data_from_rto_idspay(
  text, text, text, text, text, text
) IS 'Updates all_service_data insurance and owner name from IDSPay rto_idspay row values. owner_name maps to first_name; last_name is cleared. Match target by normalized chassis_no first, then vehicle_registration_number. Skips blank IDSPay values.';

CREATE OR REPLACE FUNCTION public.trg_refresh_all_service_data_from_rto_idspay()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF tg_op = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF COALESCE(NEW.verified, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  PERFORM public.refresh_all_service_data_from_rto_idspay(
    NEW.chassis,
    COALESCE(NEW.reg_no, NEW.registration_no),
    NEW.vehicle_insurance_company_name,
    NEW.vehicle_insurance_upto,
    NEW.vehicle_insurance_policy_number,
    NEW.owner_name
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_refresh_all_service_data_from_rto_idspay() IS
  'After write on rto_idspay, push insurance and owner name fields to matching all_service_data row.';

DROP TRIGGER IF EXISTS trg_refresh_all_service_data_from_rto_idspay ON public.rto_idspay;

CREATE TRIGGER trg_refresh_all_service_data_from_rto_idspay
  AFTER INSERT OR UPDATE OF
    chassis,
    reg_no,
    registration_no,
    owner_name,
    vehicle_insurance_company_name,
    vehicle_insurance_upto,
    vehicle_insurance_policy_number,
    verified
  ON public.rto_idspay
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_all_service_data_from_rto_idspay();

CREATE OR REPLACE FUNCTION public.reconcile_all_service_data_from_rto_idspay_chunked(
  p_limit integer DEFAULT 500
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  r record;
  v_processed integer := 0;
  v_limit integer := greatest(1, coalesce(p_limit, 500));
BEGIN
  FOR r IN
    SELECT
      chassis,
      coalesce(reg_no, registration_no) AS registration_key,
      vehicle_insurance_company_name,
      vehicle_insurance_upto,
      vehicle_insurance_policy_number,
      owner_name
    FROM public.rto_idspay
    WHERE verified IS TRUE
    ORDER BY cached_at DESC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT v_limit
  LOOP
    PERFORM public.refresh_all_service_data_from_rto_idspay(
      r.chassis,
      r.registration_key,
      r.vehicle_insurance_company_name,
      r.vehicle_insurance_upto,
      r.vehicle_insurance_policy_number,
      r.owner_name
    );
    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_all_service_data_from_rto_idspay(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_all_service_data_from_rto_idspay_chunked(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.refresh_all_service_data_from_rto_idspay(text, text, text, text, text, text)
  TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.reconcile_all_service_data_from_rto_idspay_chunked(integer)
  TO postgres, service_role;
