-- Add cre_name and driver_name columns to service_bookings
-- Also add 'driver' as a valid user role for the drivers dropdown

ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS cre_name text,
  ADD COLUMN IF NOT EXISTS driver_name text;

-- Extend the role check constraint to include 'driver'
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
    CHECK (role = ANY (ARRAY['admin'::text, 'manager'::text, 'staff'::text, 'viewer'::text, 'driver'::text]));
