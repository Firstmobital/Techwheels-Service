-- Payroll Employee Monthly Incentives: source line table + payroll_entries snapshot.
--
-- Source rows are employee/month/type transactions. Multiple rows per
-- (employee_code, payroll_month) are allowed (e.g. Parts + VAS).
-- Do NOT add UNIQUE (employee_code, payroll_month).
--
-- payroll_entries.incentive_amount is the monthly SUM snapshot, default 0.
-- This migration does not rewrite historical gross_payout / net_payable.
-- Finalized-month RLS on payroll_entries is unchanged.
--
-- Timestamp 20260917140000. Ledger: DBL-0076.
--
-- Rollback:
-- ALTER TABLE public.payroll_entries DROP COLUMN IF EXISTS incentive_amount;
-- DROP TABLE IF EXISTS public.payroll_employee_incentives;

-- ── Source lines (manual monthly employee incentives) ──
CREATE TABLE IF NOT EXISTS public.payroll_employee_incentives (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_code text NOT NULL REFERENCES public.employee_master(employee_code) ON UPDATE CASCADE ON DELETE RESTRICT,
  payroll_month date NOT NULL,
  incentive_type text NOT NULL CHECK (incentive_type IN ('Parts', 'Rusting', 'VAS', 'Others')),
  value numeric(12,2) NOT NULL CHECK (value >= 0),
  incentive_percent numeric(8,4) NOT NULL CHECK (incentive_percent >= 0),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  description text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_employee_incentives_amount_derived_chk
    CHECK (amount = round((value * incentive_percent) / 100, 2))
);

COMMENT ON TABLE public.payroll_employee_incentives IS
  'DBL-0076: Manual monthly employee incentive lines. Multiple rows per employee_code + payroll_month are allowed. Amount is derived: round(value * incentive_percent / 100, 2).';

COMMENT ON COLUMN public.payroll_employee_incentives.amount IS
  'Derived only: round(value * incentive_percent / 100, 2). Not an independent source of truth.';

CREATE INDEX IF NOT EXISTS idx_payroll_employee_incentives_month
  ON public.payroll_employee_incentives (payroll_month);

CREATE INDEX IF NOT EXISTS idx_payroll_employee_incentives_employee_month
  ON public.payroll_employee_incentives (employee_code, payroll_month);

ALTER TABLE public.payroll_employee_incentives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payroll_employee_incentives_select ON public.payroll_employee_incentives;
CREATE POLICY payroll_employee_incentives_select ON public.payroll_employee_incentives
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_module_view('payroll'));

DROP POLICY IF EXISTS payroll_employee_incentives_modify ON public.payroll_employee_incentives;
CREATE POLICY payroll_employee_incentives_modify ON public.payroll_employee_incentives
  FOR ALL TO authenticated
  USING (
    public.payroll_can_mutate_payroll()
    AND NOT public.payroll_is_month_finalized(payroll_month)
  )
  WITH CHECK (
    public.payroll_can_mutate_payroll()
    AND NOT public.payroll_is_month_finalized(payroll_month)
  );

GRANT ALL ON TABLE public.payroll_employee_incentives TO anon;
GRANT ALL ON TABLE public.payroll_employee_incentives TO authenticated;
GRANT ALL ON TABLE public.payroll_employee_incentives TO service_role;

-- ── Monthly snapshot on payroll_entries (one total per employee/month) ──
ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS incentive_amount numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.payroll_entries.incentive_amount IS
  'DBL-0076: SUM of payroll_employee_incentives.amount for this employee_code + payroll_month. Written at recompute. Existing rows default 0. Does not rewrite historical net_payable.';

NOTIFY pgrst, 'reload schema';
