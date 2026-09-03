-- Payroll Management module: compensation profiles, attendance, advances, monthly
-- payroll entries with finalization/lock workflow. Service Center uses fixed 30-day divisor.

-- ── Compensation profile (linked to employee_master, not a duplicate employee table) ──
CREATE TABLE public.payroll_compensation (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_code text NOT NULL REFERENCES public.employee_master(employee_code) ON UPDATE CASCADE ON DELETE RESTRICT,
  base_salary numeric(12,2) NOT NULL DEFAULT 0 CHECK (base_salary >= 0),
  salary_type text NOT NULL DEFAULT 'base' CHECK (salary_type IN ('base', 'variable', 'both')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_code)
);

CREATE INDEX idx_payroll_compensation_salary_type ON public.payroll_compensation (salary_type);

-- ── Monthly attendance / payable days ──
CREATE TABLE public.payroll_attendance (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_code text NOT NULL REFERENCES public.employee_master(employee_code) ON UPDATE CASCADE ON DELETE RESTRICT,
  payroll_month date NOT NULL,
  payable_days numeric(4,1) NOT NULL CHECK (payable_days >= 0 AND payable_days <= 30),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_code, payroll_month),
  CONSTRAINT payroll_attendance_half_day CHECK (mod(payable_days * 2, 1) = 0)
);

CREATE INDEX idx_payroll_attendance_month ON public.payroll_attendance (payroll_month);

-- ── Advance ledger ──
CREATE TABLE public.payroll_advances (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_code text NOT NULL REFERENCES public.employee_master(employee_code) ON UPDATE CASCADE ON DELETE RESTRICT,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  original_amount numeric(12,2) NOT NULL CHECK (original_amount > 0),
  recovered_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (recovered_amount >= 0),
  deduction_type text NOT NULL DEFAULT 'emi' CHECK (deduction_type IN ('lump_sum', 'emi', 'custom')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'cancelled')),
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payroll_advances_employee ON public.payroll_advances (employee_code, status);

CREATE TABLE public.payroll_advance_schedules (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  advance_id bigint NOT NULL REFERENCES public.payroll_advances(id) ON DELETE CASCADE,
  payroll_month date NOT NULL,
  scheduled_amount numeric(12,2) NOT NULL CHECK (scheduled_amount >= 0),
  applied_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (applied_amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'skipped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (advance_id, payroll_month)
);

CREATE INDEX idx_payroll_advance_schedules_month ON public.payroll_advance_schedules (payroll_month, status);

-- ── Month lock state ──
CREATE TABLE public.payroll_months (
  payroll_month date PRIMARY KEY,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  finalized_at timestamptz,
  finalized_by text,
  unlock_reason text,
  unlocked_at timestamptz,
  unlocked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Monthly payroll entries (authoritative snapshot) ──
CREATE TABLE public.payroll_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_code text NOT NULL REFERENCES public.employee_master(employee_code) ON UPDATE CASCADE ON DELETE RESTRICT,
  payroll_month date NOT NULL,
  salary_type_snapshot text NOT NULL CHECK (salary_type_snapshot IN ('base', 'variable', 'both')),
  base_salary_snapshot numeric(12,2) NOT NULL DEFAULT 0,
  payable_days_snapshot numeric(4,1) NOT NULL DEFAULT 0,
  earned_base numeric(12,2) NOT NULL DEFAULT 0,
  sa_variable_earning numeric(12,2) NOT NULL DEFAULT 0,
  technician_variable_earning numeric(12,2) NOT NULL DEFAULT 0,
  variable_earning_total numeric(12,2) NOT NULL DEFAULT 0,
  custom_additions numeric(12,2) NOT NULL DEFAULT 0,
  other_deductions numeric(12,2) NOT NULL DEFAULT 0,
  advance_deduction numeric(12,2) NOT NULL DEFAULT 0,
  gross_payout numeric(12,2) NOT NULL DEFAULT 0,
  net_payable numeric(12,2) NOT NULL DEFAULT 0,
  variable_source_detail jsonb,
  review_flags jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_code, payroll_month)
);

CREATE INDEX idx_payroll_entries_month ON public.payroll_entries (payroll_month);

-- ── Manual adjustments with audit trail ──
CREATE TABLE public.payroll_adjustments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payroll_entry_id bigint NOT NULL REFERENCES public.payroll_entries(id) ON DELETE CASCADE,
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('addition', 'deduction', 'variable_override')),
  amount numeric(12,2) NOT NULL,
  reason text NOT NULL,
  actor text NOT NULL,
  original_value numeric(12,2),
  replacement_value numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payroll_adjustments_entry ON public.payroll_adjustments (payroll_entry_id);

-- ── Helper: is payroll month finalized? ──
CREATE OR REPLACE FUNCTION public.payroll_is_month_finalized(p_month date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT status = 'finalized' FROM payroll_months WHERE payroll_month = date_trunc('month', p_month)::date),
    false
  );
$$;

-- ── Helper: earned base salary (30-day divisor, nearest rupee) ──
CREATE OR REPLACE FUNCTION public.payroll_calc_earned_base(
  p_base_salary numeric,
  p_payable_days numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_base_salary IS NULL OR p_base_salary <= 0 OR p_payable_days IS NULL OR p_payable_days <= 0 THEN 0
    ELSE round((p_base_salary / 30.0) * p_payable_days, 0)
  END;
$$;

-- ── Check if independent variable disbursement is blocked for employee/month ──
CREATE OR REPLACE FUNCTION public.payroll_is_variable_disbursement_blocked(
  p_employee_code text,
  p_month date
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_month date := date_trunc('month', p_month)::date;
  v_finalized boolean;
  v_salary_type text;
  v_has_variable_entry boolean;
BEGIN
  IF NOT public.payroll_is_month_finalized(v_month) THEN
    RETURN false;
  END IF;

  SELECT pc.salary_type INTO v_salary_type
  FROM payroll_compensation pc
  WHERE upper(trim(pc.employee_code)) = upper(trim(p_employee_code));

  IF v_salary_type IS NULL OR v_salary_type = 'base' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM payroll_entries pe
    WHERE upper(trim(pe.employee_code)) = upper(trim(p_employee_code))
      AND pe.payroll_month = v_month
      AND pe.variable_earning_total > 0
  ) INTO v_has_variable_entry;

  RETURN v_has_variable_entry;
END;
$$;

-- ── Finalize payroll month (server-authoritative lock) ──
CREATE OR REPLACE FUNCTION public.payroll_finalize_month(
  p_month date,
  p_actor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month date := date_trunc('month', p_month)::date;
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('payroll')) THEN
    RAISE EXCEPTION 'Unauthorized: payroll finalize requires modify permission';
  END IF;

  IF public.payroll_is_month_finalized(v_month) THEN
    RAISE EXCEPTION 'Payroll month % is already finalized', v_month;
  END IF;

  INSERT INTO payroll_months (payroll_month, status, finalized_at, finalized_by, updated_at)
  VALUES (v_month, 'finalized', now(), p_actor, now())
  ON CONFLICT (payroll_month) DO UPDATE
  SET status = 'finalized', finalized_at = now(), finalized_by = p_actor,
      unlock_reason = NULL, unlocked_at = NULL, unlocked_by = NULL, updated_at = now();

  -- Mark advance schedule rows as applied for this month based on payroll entries
  UPDATE payroll_advance_schedules pas
  SET applied_amount = pas.scheduled_amount, status = 'applied', updated_at = now()
  FROM payroll_entries pe
  WHERE pas.payroll_month = v_month
    AND pas.status = 'pending'
    AND pas.scheduled_amount > 0
    AND EXISTS (
      SELECT 1 FROM payroll_advances pa
      WHERE pa.id = pas.advance_id
        AND upper(trim(pa.employee_code)) = upper(trim(pe.employee_code))
        AND pe.payroll_month = v_month
        AND pe.advance_deduction >= pas.scheduled_amount
    );

  UPDATE payroll_advances pa
  SET recovered_amount = sub.total_applied,
      status = CASE WHEN sub.total_applied >= pa.original_amount THEN 'closed' ELSE pa.status END,
      updated_at = now()
  FROM (
    SELECT advance_id, sum(applied_amount) AS total_applied
    FROM payroll_advance_schedules
    WHERE status = 'applied'
    GROUP BY advance_id
  ) sub
  WHERE pa.id = sub.advance_id;

  RETURN jsonb_build_object('payroll_month', v_month, 'status', 'finalized');
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_finalize_month(date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payroll_finalize_month(date, text) TO authenticated;

-- ── Unlock payroll month (requires delete permission or admin) ──
CREATE OR REPLACE FUNCTION public.payroll_unlock_month(
  p_month date,
  p_reason text,
  p_actor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month date := date_trunc('month', p_month)::date;
BEGIN
  IF NOT (public.is_admin() OR public.has_module_delete('payroll')) THEN
    RAISE EXCEPTION 'Unauthorized: payroll unlock requires delete permission';
  END IF;

  IF trim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Unlock reason is required';
  END IF;

  UPDATE payroll_months
  SET status = 'draft', unlock_reason = p_reason, unlocked_at = now(), unlocked_by = p_actor, updated_at = now()
  WHERE payroll_month = v_month;

  IF NOT FOUND THEN
    INSERT INTO payroll_months (payroll_month, status, unlock_reason, unlocked_at, unlocked_by)
    VALUES (v_month, 'draft', p_reason, now(), p_actor);
  END IF;

  RETURN jsonb_build_object('payroll_month', v_month, 'status', 'draft');
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_unlock_month(date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payroll_unlock_month(date, text, text) TO authenticated;

-- ── RLS ──
ALTER TABLE public.payroll_compensation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_advance_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;

-- View policies
CREATE POLICY payroll_compensation_select ON public.payroll_compensation
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_module_view('payroll'));

CREATE POLICY payroll_attendance_select ON public.payroll_attendance
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_module_view('payroll'));

CREATE POLICY payroll_advances_select ON public.payroll_advances
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_module_view('payroll'));

CREATE POLICY payroll_advance_schedules_select ON public.payroll_advance_schedules
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_module_view('payroll'));

CREATE POLICY payroll_months_select ON public.payroll_months
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_module_view('payroll'));

CREATE POLICY payroll_entries_select ON public.payroll_entries
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_module_view('payroll'));

CREATE POLICY payroll_adjustments_select ON public.payroll_adjustments
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_module_view('payroll'));

-- Modify policies (blocked when month finalized for attendance/entries)
CREATE POLICY payroll_compensation_modify ON public.payroll_compensation
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.has_module_modify('payroll'))
  WITH CHECK (public.is_admin() OR public.has_module_modify('payroll'));

CREATE POLICY payroll_attendance_modify ON public.payroll_attendance
  FOR ALL TO authenticated
  USING (
    (public.is_admin() OR public.has_module_modify('payroll'))
    AND NOT public.payroll_is_month_finalized(payroll_month)
  )
  WITH CHECK (
    (public.is_admin() OR public.has_module_modify('payroll'))
    AND NOT public.payroll_is_month_finalized(payroll_month)
  );

CREATE POLICY payroll_advances_modify ON public.payroll_advances
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.has_module_modify('payroll'))
  WITH CHECK (public.is_admin() OR public.has_module_modify('payroll'));

CREATE POLICY payroll_advance_schedules_modify ON public.payroll_advance_schedules
  FOR ALL TO authenticated
  USING (
    (public.is_admin() OR public.has_module_modify('payroll'))
    AND NOT public.payroll_is_month_finalized(payroll_month)
  )
  WITH CHECK (
    (public.is_admin() OR public.has_module_modify('payroll'))
    AND NOT public.payroll_is_month_finalized(payroll_month)
  );

CREATE POLICY payroll_entries_modify ON public.payroll_entries
  FOR ALL TO authenticated
  USING (
    (public.is_admin() OR public.has_module_modify('payroll'))
    AND NOT public.payroll_is_month_finalized(payroll_month)
  )
  WITH CHECK (
    (public.is_admin() OR public.has_module_modify('payroll'))
    AND NOT public.payroll_is_month_finalized(payroll_month)
  );

CREATE POLICY payroll_adjustments_modify ON public.payroll_adjustments
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.has_module_modify('payroll'))
  WITH CHECK (public.is_admin() OR public.has_module_modify('payroll'));

CREATE POLICY payroll_months_modify ON public.payroll_months
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.has_module_modify('payroll'))
  WITH CHECK (public.is_admin() OR public.has_module_modify('payroll'));

-- ── Module registration ──
INSERT INTO public.modules (name, label, description, route, sort_order, is_active)
VALUES (
  'payroll',
  'Payroll Management',
  'Configure incentives, advances, attendance, and finalize monthly payroll.',
  '/payroll',
  28,
  true
)
ON CONFLICT (name) DO NOTHING;
