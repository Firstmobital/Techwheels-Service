-- DBL-0041: Allow SQL Editor / service_role to provision the payroll security hash.
-- payroll_set_security_code previously required is_admin(), which is false when
-- auth.uid() is null (Supabase SQL Editor). Authenticated non-admin JWTs still fail.
-- Do not seed a plaintext code in this file.

CREATE OR REPLACE FUNCTION public.payroll_set_security_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_has_jwt boolean := auth.uid() IS NOT NULL
    OR nullif(current_setting('request.jwt.claim.sub', true), '') IS NOT NULL;
BEGIN
  IF NOT (
    public.is_admin()
    OR v_jwt_role = 'service_role'
    OR coalesce(auth.role(), '') = 'service_role'
    OR NOT v_has_jwt
  ) THEN
    RAISE EXCEPTION 'Unauthorized: setting the payroll security code requires admin';
  END IF;

  IF trim(coalesce(p_code, '')) = '' THEN
    RAISE EXCEPTION 'Security code is required';
  END IF;

  INSERT INTO public.payroll_security_settings (id, security_code_hash, updated_at, updated_by)
  VALUES (1, extensions.crypt(p_code, extensions.gen_salt('bf')), now(), auth.uid())
  ON CONFLICT (id) DO UPDATE
  SET security_code_hash = EXCLUDED.security_code_hash,
      updated_at = now(),
      updated_by = auth.uid();

  RETURN jsonb_build_object('ok', true, 'updated_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_set_security_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payroll_set_security_code(text) TO authenticated, service_role;
