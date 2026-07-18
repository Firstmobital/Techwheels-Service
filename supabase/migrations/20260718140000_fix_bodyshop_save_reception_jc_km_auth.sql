-- Fix: bodyshop_save_reception_jc_km used my_employee_code() (primary link only)
-- with strict string equality. service_reception_update_sa uses user_has_employee_code()
-- (any active link). SA users who could update via RLS were blocked by the RPC.

CREATE OR REPLACE FUNCTION public.bodyshop_save_reception_jc_km(
  p_reception_entry_id bigint,
  p_jc_number          text    DEFAULT NULL,
  p_km_reading         integer DEFAULT NULL
)
RETURNS TABLE (
  id          bigint,
  jc_number   text,
  km_reading  integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sa_employee_code text;
  v_card_sa_code     text;
  v_is_admin         boolean;
  v_has_sa_modify    boolean;
BEGIN
  -- ── 1. Authorisation ────────────────────────────────────────────────────
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

  -- Non-admins must map to the SA on the reception row (or linked repair card).
  IF NOT v_is_admin THEN
    SELECT brc.sa_employee_code
      INTO v_card_sa_code
      FROM public.bodyshop_repair_cards brc
     WHERE brc.reception_entry_id = p_reception_entry_id
     ORDER BY brc.updated_at DESC NULLS LAST, brc.id DESC
     LIMIT 1;

    IF NOT (
      (v_sa_employee_code IS NOT NULL AND public.user_has_employee_code(v_sa_employee_code))
      OR (v_card_sa_code IS NOT NULL AND public.user_has_employee_code(v_card_sa_code))
    ) THEN
      RAISE EXCEPTION 'permission denied: caller is not the SA on this reception entry'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── 2. Build and execute the UPDATE ─────────────────────────────────────
  RETURN QUERY
  UPDATE public.service_reception_entries sre
     SET jc_number  = COALESCE(p_jc_number,  sre.jc_number),
         km_reading = COALESCE(p_km_reading, sre.km_reading),
         updated_at = now()
   WHERE sre.id = p_reception_entry_id
   RETURNING sre.id, sre.jc_number, sre.km_reading;
END;
$$;

COMMENT ON FUNCTION public.bodyshop_save_reception_jc_km(bigint, text, integer)
IS 'SECURITY DEFINER RPC: updates jc_number and/or km_reading on a single '
   'service_reception_entries row. Bypasses expensive authenticated-role RLS '
   'policies while enforcing the same authorization rules as '
   'service_reception_update_sa (user_has_employee_code on reception or '
   'linked bodyshop repair card SA code). Admin bypasses SA ownership check.';

GRANT EXECUTE ON FUNCTION public.bodyshop_save_reception_jc_km(bigint, text, integer)
  TO authenticated;
