-- Add fuel_type column to employee_master table
-- Safe to run multiple times

alter table if exists public.employee_master
  add column if not exists fuel_type text;

-- Add comment for clarity
comment on column public.employee_master.fuel_type is 'Fuel type for the service advisor (e.g., PV, EV)';
