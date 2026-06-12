-- Add employee banking fields used by Settings -> Employee Master.
-- This is additive-only and safe for existing rows.

alter table if exists public.employee_master
  add column if not exists bank_name text,
  add column if not exists account_number text,
  add column if not exists ifsc text;

comment on column public.employee_master.bank_name is
  'Bank name for employee payout details.';

comment on column public.employee_master.account_number is
  'Bank account number for employee payout details.';

comment on column public.employee_master.ifsc is
  'IFSC code for employee bank account.';
