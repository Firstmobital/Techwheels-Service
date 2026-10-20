-- MOBILE-016: New RPC for customers to self-register a vehicle via the customer portal.
-- Inserts into vehicles table with source=customer_self_register.
-- Idempotent: ON CONFLICT (reg_number) DO NOTHING — returns existing row if already present.

CREATE OR REPLACE FUNCTION public.customer_register_vehicle(
  p_session_token text,
  p_reg_number    text,
  p_owner_name    text,
  p_model         text,
  p_variant       text    DEFAULT NULL,
  p_km_reading    integer DEFAULT NULL,
  p_branch        text    DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_sess  RECORD;
  v_reg   text;
  v_row   public.vehicles%ROWTYPE;
BEGIN
  v_sess := public.customer_require_session(p_session_token);

  v_reg := public.customer_norm_reg(p_reg_number);
  IF v_reg IS NULL THEN
    RAISE EXCEPTION 'Invalid registration number format. Please check and try again.';
  END IF;

  IF trim(p_owner_name) = '' OR p_owner_name IS NULL THEN
    RAISE EXCEPTION 'Owner name is required.';
  END IF;

  IF trim(p_model) = '' OR p_model IS NULL THEN
    RAISE EXCEPTION 'Vehicle model is required.';
  END IF;

  INSERT INTO public.vehicles (
    reg_number,
    owner_name,
    owner_phone,
    model,
    dealer_code,
    source
  ) VALUES (
    v_reg,
    trim(p_owner_name),
    v_sess.phone,
    trim(p_model),
    'SELF',
    'customer_self_register'
  )
  ON CONFLICT (reg_number) DO NOTHING;

  SELECT * INTO v_row FROM public.vehicles WHERE reg_number = v_reg;

  RETURN jsonb_build_object(
    'reg_number',  v_row.reg_number,
    'owner_name',  v_row.owner_name,
    'owner_phone', v_row.owner_phone,
    'model',       v_row.model,
    'source',      coalesce(v_row.source, 'dms')
  );
END;
$$;

COMMENT ON FUNCTION public.customer_register_vehicle(text, text, text, text, text, integer, text) IS
  'MOBILE-016: Self-registration of a vehicle by a new customer via the customer portal. '
  'Inserts into vehicles with source=customer_self_register. '
  'Idempotent on conflict — returns the existing row if the reg_number already exists. '
  'customer_collect_vehicles already reads from vehicles table so the new vehicle '
  'appears in subsequent sessions automatically.';
