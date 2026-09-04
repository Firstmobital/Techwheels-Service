-- DBL-0030: admin-only atomic create of employee_master + payroll_compensation
-- from Payroll > Salary Type. Does not widen employee_master INSERT RLS.
-- Does not mutate users.is_active or user_employee_links.is_active.
-- New rows inherit employee_master.is_active DEFAULT true.
-- Sibling of payroll_save_salary_type_master (update-only); does not overload it.
--
-- Rollback:
-- DROP FUNCTION IF EXISTS public.payroll_create_salary_type_employee(text, text, text, text, text, text, text, text, text, numeric, text);

CREATE OR REPLACE FUNCTION public.payroll_create_salary_type_employee(
  p_employee_code text,
  p_employee_name text,
  p_department text,
  p_location text,
  p_role text,
  p_fuel_type text,
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
  v_name text := btrim(coalesce(p_employee_name, ''));
  v_dept text := nullif(btrim(coalesce(p_department, '')), '');
  v_loc text := nullif(btrim(coalesce(p_location, '')), '');
  v_role text := nullif(btrim(coalesce(p_role, '')), '');
  v_fuel text := nullif(btrim(coalesce(p_fuel_type, '')), '');
  v_account text := nullif(btrim(coalesce(p_account_number, '')), '');
  v_ifsc text := nullif(upper(btrim(coalesce(p_ifsc, ''))), '');
  v_bank text := nullif(btrim(coalesce(p_bank_name, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: create employee from payroll requires admin';
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'Employee code is required';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'Employee name is required';
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

  IF EXISTS (
    SELECT 1
    FROM public.employee_master em
    WHERE upper(btrim(em.employee_code)) = v_code
  ) THEN
    RAISE EXCEPTION 'Employee code already exists';
  END IF;

  INSERT INTO public.employee_master (
    employee_code,
    employee_name,
    department,
    location,
    role,
    fuel_type,
    account_number,
    ifsc,
    bank_name
  )
  VALUES (
    v_code,
    v_name,
    v_dept,
    v_loc,
    v_role,
    v_fuel,
    v_account,
    v_ifsc,
    v_bank
  );

  INSERT INTO public.payroll_compensation (employee_code, base_salary, salary_type, updated_at)
  VALUES (v_code, p_base_salary, p_salary_type, now());

  RETURN jsonb_build_object('ok', true, 'employee_code', v_code);
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_create_salary_type_employee(text, text, text, text, text, text, text, text, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payroll_create_salary_type_employee(text, text, text, text, text, text, text, text, text, numeric, text) TO authenticated;
