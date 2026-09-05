-- Add dedicated Bodyshop Variable snapshot on payroll_entries, matching
-- sa_variable_earning / technician_variable_earning.
--
-- Accident labour belongs to this stream (Bodyshop Tracker / closed_date_time IST).
-- Existing rows stay 0 via DEFAULT. Does not rewrite finalized amounts.
-- Finalized-month RLS (payroll_entries_modify) already blocks the whole row.
--
-- Timestamp 20260905150000. Ledger: DBL-0039.
--
-- Rollback:
-- ALTER TABLE public.payroll_entries
--   DROP COLUMN IF EXISTS bodyshop_variable_earning;

ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS bodyshop_variable_earning numeric(12,2) NOT NULL DEFAULT 0;
