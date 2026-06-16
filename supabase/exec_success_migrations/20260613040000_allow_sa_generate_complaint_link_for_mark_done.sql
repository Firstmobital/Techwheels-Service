BEGIN;

-- Allow Service Advisor module users to mint complaint links for rows they are allowed to act on.
-- This keeps Mark Done -> WhatsApp flow link-complete without requiring complaints modify access.
CREATE OR REPLACE FUNCTION public.generate_complaint_link(p_reception_entry_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dealer_code text;
  v_token text;
  v_link_id bigint;
  v_sa_employee_code text;
BEGIN
  SELECT dealer_code, sa_employee_code
    INTO v_dealer_code, v_sa_employee_code
  FROM public.service_reception_entries
  WHERE id = p_reception_entry_id;

  IF v_dealer_code IS NULL THEN
    RAISE EXCEPTION 'Reception entry not found';
  END IF;

  IF NOT (
    public.is_admin()
    OR public.has_module_modify('complaints')
    OR (
      public.has_module_modify('service_advisor')
      AND v_sa_employee_code IS NOT NULL
      AND (
        public.user_has_employee_code(v_sa_employee_code)
        OR public.user_is_crm_for_dealer_sa(v_sa_employee_code)
        OR EXISTS (
          SELECT 1
          FROM public.user_employee_links uel
          JOIN public.employee_master em
            ON em.employee_code = uel.employee_code
          WHERE uel.user_id = auth.uid()
            AND uel.is_active = true
            AND lower(btrim(coalesce(em.role, ''))) = ANY (ARRAY['sm', 'gm'])
        )
      )
    )
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Generate a 128-bit random token (URL-safe base64)
  v_token := encode(gen_random_bytes(16), 'base64')
    || encode(gen_random_bytes(8), 'base64');

  -- Remove padding and special chars
  v_token := REPLACE(REPLACE(REPLACE(v_token, '/', '_'), '+', '-'), '=', '');
  v_token := SUBSTRING(v_token FROM 1 FOR 24);

  -- One active link per reception entry
  INSERT INTO public.complaint_access_links (
    dealer_code, reception_entry_id, token, status
  ) VALUES (
    v_dealer_code, p_reception_entry_id, v_token, 'active'
  )
  ON CONFLICT (reception_entry_id) DO UPDATE
  SET token = v_token, status = 'active', created_at = now()
  RETURNING id INTO v_link_id;

  RETURN jsonb_build_object(
    'link_id', v_link_id,
    'token', v_token,
    'url', 'https://tw.care/c/' || v_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_complaint_link(bigint) TO authenticated;

COMMIT;
