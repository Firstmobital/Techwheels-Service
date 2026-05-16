-- Add missing optional invoice amount columns used by importer.
-- Safe to run multiple times.

alter table if exists public.service_invoice_data
  add column if not exists discounts_labour numeric,
  add column if not exists other_charges_labour numeric,
  add column if not exists discounts_parts numeric,
  add column if not exists other_charges_parts numeric,
  add column if not exists final_tcs_amount numeric;

-- Backfill nulls for existing rows (optional but keeps reporting math clean).
update public.service_invoice_data
set
  discounts_labour = coalesce(discounts_labour, 0),
  other_charges_labour = coalesce(other_charges_labour, 0),
  discounts_parts = coalesce(discounts_parts, 0),
  other_charges_parts = coalesce(other_charges_parts, 0),
  final_tcs_amount = coalesce(final_tcs_amount, 0)
where
  discounts_labour is null
  or other_charges_labour is null
  or discounts_parts is null
  or other_charges_parts is null
  or final_tcs_amount is null;

alter table public.service_invoice_data
  alter column discounts_labour set default 0,
  alter column other_charges_labour set default 0,
  alter column discounts_parts set default 0,
  alter column other_charges_parts set default 0,
  alter column final_tcs_amount set default 0;

-- Ask PostgREST to refresh schema cache immediately.
notify pgrst, 'reload schema';
