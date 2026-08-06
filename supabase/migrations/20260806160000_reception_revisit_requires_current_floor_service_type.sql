-- RECEPTION-002 fix: revisit only when THIS visit's service_type is a floor-incharge type.

CREATE OR REPLACE FUNCTION public.get_reception_revisit_context(
  p_reg_number text,
  p_exclude_entry_id bigint DEFAULT NULL,
  p_service_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dealer_code text;
  v_prior record;
BEGIN
  v_dealer_code := public.my_dealer_code();

  IF NULLIF(btrim(p_reg_number), '') IS NULL THEN
    RETURN jsonb_build_object('is_revisit', false);
  END IF;

  IF NOT public.is_floor_incharge_service_type(p_service_type) THEN
    RETURN jsonb_build_object('is_revisit', false);
  END IF;

  SELECT *
  INTO v_prior
  FROM public.lookup_reception_revisit_prior(
    p_reg_number,
    v_dealer_code,
    p_exclude_entry_id
  );

  IF NOT FOUND OR v_prior.prior_id IS NULL THEN
    RETURN jsonb_build_object('is_revisit', false);
  END IF;

  RETURN jsonb_build_object(
    'is_revisit', true,
    'prior_entry', jsonb_build_object(
      'id', v_prior.prior_id,
      'sa_employee_code', v_prior.prior_sa_employee_code,
      'sa_name', v_prior.prior_sa_name,
      'jc_number', v_prior.prior_jc_number,
      'service_type', v_prior.prior_service_type,
      'created_at', v_prior.prior_created_at
    ),
    'suggested_technician', CASE
      WHEN NULLIF(btrim(v_prior.suggested_technician_code), '') IS NULL THEN NULL
      ELSE jsonb_build_object(
        'code', v_prior.suggested_technician_code,
        'name', v_prior.suggested_technician_name
      )
    END
  );
END;
$$;

COMMENT ON FUNCTION public.get_reception_revisit_context(text, bigint, text) IS
  'Returns revisit context when current service_type is floor-incharge and a qualifying prior visit exists within 30 days.';

CREATE OR REPLACE FUNCTION public.apply_revisit_context_on_reception()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_prior record;
BEGIN
  IF NULLIF(btrim(NEW.reg_number), '') IS NULL
     OR NOT public.is_floor_incharge_service_type(NEW.service_type) THEN
    NEW.is_revisit := false;
    NEW.prior_reception_entry_id := NULL;
    NEW.suggested_technician_code := NULL;
    NEW.suggested_technician_name := NULL;
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_prior
  FROM public.lookup_reception_revisit_prior(
    NEW.reg_number,
    NEW.dealer_code,
    NEW.id
  );

  IF NOT FOUND OR v_prior.prior_id IS NULL THEN
    NEW.is_revisit := false;
    NEW.prior_reception_entry_id := NULL;
    NEW.suggested_technician_code := NULL;
    NEW.suggested_technician_name := NULL;
    RETURN NEW;
  END IF;

  NEW.is_revisit := true;
  NEW.prior_reception_entry_id := v_prior.prior_id;
  NEW.suggested_technician_code := NULLIF(btrim(v_prior.suggested_technician_code), '');
  NEW.suggested_technician_name := NULLIF(btrim(v_prior.suggested_technician_name), '');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_revisit_on_reception ON public.service_reception_entries;

CREATE TRIGGER trg_apply_revisit_on_reception
  BEFORE INSERT OR UPDATE OF reg_number, service_type
  ON public.service_reception_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_revisit_context_on_reception();

-- Clear revisit flags on rows saved before this rule when current service_type is not floor.
UPDATE public.service_reception_entries
SET
  is_revisit = false,
  prior_reception_entry_id = NULL,
  suggested_technician_code = NULL,
  suggested_technician_name = NULL
WHERE is_revisit = true
  AND NOT public.is_floor_incharge_service_type(service_type);

GRANT EXECUTE ON FUNCTION public.get_reception_revisit_context(text, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reception_revisit_context(text, bigint, text) TO service_role;
