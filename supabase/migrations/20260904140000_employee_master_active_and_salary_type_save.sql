-- DBL-0028: employee_master.is_active + narrow admin RPCs for Salary Type master save
-- and employee activate/deactivate. Does not widen employee_master UPDATE RLS.
--
-- Existing employees remain active via DEFAULT true.
-- SECURITY DEFINER functions authorize with is_admin() only.
-- Does not mutate users.is_active or user_employee_links.is_active.
--
-- Rollback:
-- DROP FUNCTION IF EXISTS public.payroll_save_salary_type_master(text, text, text, text, text, text, numeric, text);
-- DROP FUNCTION IF EXISTS public.payroll_set_employee_active(text, boolean);
-- ALTER TABLE public.employee_master DROP COLUMN IF EXISTS is_active;

ALTER TABLE public.employee_master
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.payroll_save_salary_type_master(
  p_employee_code text,
  p_department text,
  p_location text,
  p_account_number text,
  p_ifsc text,
  p_bank_name text,
  p_base_salary numeric,
  p_salary_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_employee_code, '')));
  v_dept text := nullif(btrim(coalesce(p_department, '')), '');
  v_loc text := nullif(btrim(coalesce(p_location, '')), '');
  v_account text := nullif(btrim(coalesce(p_account_number, '')), '');
  v_ifsc text := nullif(upper(btrim(coalesce(p_ifsc, ''))), '');
  v_bank text := nullif(btrim(coalesce(p_bank_name, '')), '');
  v_updated int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: salary type master save requires admin';
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'Employee code is required';
  END IF;

  IF p_base_salary IS NULL OR p_base_salary < 0 THEN
    RAISE EXCEPTION 'Invalid base salary';
  END IF;

  IF p_salary_type IS NULL OR p_salary_type NOT IN ('base', 'variable', 'both') THEN
    RAISE EXCEPTION 'Invalid salary type';
  END IF;

  IF v_ifsc IS NOT NULL AND v_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'Invalid IFSC';
  END IF;

  IF v_account IS NOT NULL AND (v_account ~* 'e[+\-]' OR v_account ~ '^\d+\.\d+$') THEN
    RAISE EXCEPTION 'Unsafe bank account format';
  END IF;

  UPDATE public.employee_master
  SET
    department = v_dept,
    location = v_loc,
    account_number = v_account,
    ifsc = v_ifsc,
    bank_name = v_bank
  WHERE upper(btrim(employee_code)) = v_code;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  INSERT INTO public.payroll_compensation (employee_code, base_salary, salary_type, updated_at)
  VALUES (v_code, p_base_salary, p_salary_type, now())
  ON CONFLICT (employee_code) DO UPDATE
  SET
    base_salary = EXCLUDED.base_salary,
    salary_type = EXCLUDED.salary_type,
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'employee_code', v_code);
END;
$$;

CREATE OR REPLACE FUNCTION public.payroll_set_employee_active(
  p_employee_code text,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_employee_code, '')));
  v_updated int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: employee activate/deactivate requires admin';
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'Employee code is required';
  END IF;

  IF p_is_active IS NULL THEN
    RAISE EXCEPTION 'is_active is required';
  END IF;

  UPDATE public.employee_master
  SET is_active = p_is_active
  WHERE upper(btrim(employee_code)) = v_code;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  RETURN jsonb_build_object('ok', true, 'employee_code', v_code, 'is_active', p_is_active);
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_save_salary_type_master(text, text, text, text, text, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payroll_save_salary_type_master(text, text, text, text, text, text, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.payroll_set_employee_active(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payroll_set_employee_active(text, boolean) TO authenticated;
