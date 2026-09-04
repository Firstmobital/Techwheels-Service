-- Extend payroll_entries with payroll-period employee identity / org / bank snapshots.
-- Draft recompute may refresh these columns. Finalized-month RLS already blocks all
-- payroll_entries writes, including these new columns.
--
-- Timestamp 20260904130000: 20260904120000 is already used by
-- bodyshop_settlement_ledger (DBL-0026). This change is DBL-0027.
--
-- Legacy backfill copies current employee_master values as a best-effort baseline only.
-- It does not reconstruct historical employee-master state at the original payroll date.
--
-- Rollback:
-- ALTER TABLE public.payroll_entries
--   DROP COLUMN IF EXISTS employee_name_snapshot,
--   DROP COLUMN IF EXISTS department_snapshot,
--   DROP COLUMN IF EXISTS branch_snapshot,
--   DROP COLUMN IF EXISTS role_snapshot,
--   DROP COLUMN IF EXISTS bank_name_snapshot,
--   DROP COLUMN IF EXISTS account_number_snapshot,
--   DROP COLUMN IF EXISTS ifsc_snapshot;

ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS employee_name_snapshot text,
  ADD COLUMN IF NOT EXISTS department_snapshot text,
  ADD COLUMN IF NOT EXISTS branch_snapshot text,
  ADD COLUMN IF NOT EXISTS role_snapshot text,
  ADD COLUMN IF NOT EXISTS bank_name_snapshot text,
  ADD COLUMN IF NOT EXISTS account_number_snapshot text,
  ADD COLUMN IF NOT EXISTS ifsc_snapshot text;

-- Best-effort legacy baseline. Only fills NULL snapshot columns.
-- Does not rewrite numeric payroll amounts, month status, or employee_code.
UPDATE public.payroll_entries pe
SET
  employee_name_snapshot = COALESCE(pe.employee_name_snapshot, NULLIF(btrim(em.employee_name), '')),
  department_snapshot = COALESCE(pe.department_snapshot, NULLIF(btrim(em.department), '')),
  branch_snapshot = COALESCE(pe.branch_snapshot, NULLIF(btrim(em.location), '')),
  role_snapshot = COALESCE(pe.role_snapshot, NULLIF(btrim(em.role), '')),
  bank_name_snapshot = COALESCE(pe.bank_name_snapshot, NULLIF(btrim(em.bank_name), '')),
  account_number_snapshot = COALESCE(pe.account_number_snapshot, NULLIF(btrim(em.account_number), '')),
  ifsc_snapshot = COALESCE(pe.ifsc_snapshot, NULLIF(btrim(em.ifsc), ''))
FROM public.employee_master em
WHERE upper(btrim(pe.employee_code)) = upper(btrim(em.employee_code));
