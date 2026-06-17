-- Durable income-eligibility layer
-- Goal: keep technician_assignments permissive for floor workflow,
-- while exposing a role-scoped read projection for income modules.

BEGIN;

CREATE TABLE IF NOT EXISTS public.income_role_scope (
  module_key text NOT NULL,
  assignment_source text NOT NULL,
  employee_role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT income_role_scope_module_key_nonempty CHECK (btrim(module_key) <> ''),
  CONSTRAINT income_role_scope_assignment_source_nonempty CHECK (btrim(assignment_source) <> ''),
  CONSTRAINT income_role_scope_employee_role_nonempty CHECK (btrim(employee_role) <> ''),
  CONSTRAINT income_role_scope_pkey PRIMARY KEY (module_key, assignment_source, employee_role)
);

COMMENT ON TABLE public.income_role_scope IS 'Income eligibility matrix by module and assignment source. Keeps write-side assignment tables permissive while enforcing role-scoped income reads.';
COMMENT ON COLUMN public.income_role_scope.module_key IS 'Logical income module key (example: technician_income).';
COMMENT ON COLUMN public.income_role_scope.assignment_source IS 'Assignment source table identifier (example: technician_assignments).';
COMMENT ON COLUMN public.income_role_scope.employee_role IS 'Allowed Employee Master business role for income eligibility.';

INSERT INTO public.income_role_scope (module_key, assignment_source, employee_role, is_active)
VALUES ('technician_income', 'technician_assignments', 'TECHNICIAN', true)
ON CONFLICT (module_key, assignment_source, employee_role) DO UPDATE
SET is_active = EXCLUDED.is_active,
    updated_at = now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_income_role_scope_updated_at'
  ) THEN
    CREATE TRIGGER trg_income_role_scope_updated_at
    BEFORE UPDATE ON public.income_role_scope
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END
$$;

ALTER TABLE public.income_role_scope ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'income_role_scope'
      AND policyname = 'income_role_scope_select_all'
  ) THEN
    CREATE POLICY income_role_scope_select_all
      ON public.income_role_scope
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'income_role_scope'
      AND policyname = 'income_role_scope_admin_insert'
  ) THEN
    CREATE POLICY income_role_scope_admin_insert
      ON public.income_role_scope
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'income_role_scope'
      AND policyname = 'income_role_scope_admin_update'
  ) THEN
    CREATE POLICY income_role_scope_admin_update
      ON public.income_role_scope
      FOR UPDATE
      TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'income_role_scope'
      AND policyname = 'income_role_scope_admin_delete'
  ) THEN
    CREATE POLICY income_role_scope_admin_delete
      ON public.income_role_scope
      FOR DELETE
      TO authenticated
      USING (public.is_admin());
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.is_income_assignment_eligible(
  p_module_key text,
  p_assignment_source text,
  p_employee_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employee_master em
    JOIN public.income_role_scope rs
      ON rs.is_active = true
     AND upper(btrim(rs.module_key)) = upper(btrim(coalesce(p_module_key, '')))
     AND upper(btrim(rs.assignment_source)) = upper(btrim(coalesce(p_assignment_source, '')))
     AND upper(btrim(rs.employee_role)) = upper(btrim(coalesce(em.role, '')))
    WHERE upper(btrim(coalesce(em.employee_code, ''))) = upper(btrim(coalesce(p_employee_code, '')))
  );
$$;

COMMENT ON FUNCTION public.is_income_assignment_eligible(text, text, text)
IS 'Returns true when employee_code is eligible for the income module according to income_role_scope and employee_master.role.';

CREATE OR REPLACE VIEW public.vw_technician_income_assignments
WITH (security_invoker='true')
AS
SELECT ta.*
FROM public.technician_assignments ta
WHERE public.is_income_assignment_eligible('technician_income', 'technician_assignments', ta.technician_code);

COMMENT ON VIEW public.vw_technician_income_assignments
IS 'Technician-income projection: technician_assignments rows limited to eligible Employee Master roles configured in income_role_scope.';

GRANT SELECT ON public.income_role_scope TO authenticated;
GRANT SELECT ON public.vw_technician_income_assignments TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_income_assignment_eligible(text, text, text) TO authenticated;

COMMIT;
