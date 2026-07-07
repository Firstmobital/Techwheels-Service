-- Verify cre_name and driver_name columns exist on service_bookings
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'service_bookings'
  AND column_name IN ('cre_name', 'driver_name');

-- Verify 'driver' is now a valid role in users constraint
SELECT pg_get_constraintdef(oid) AS constraint_def
FROM pg_constraint
WHERE conname = 'users_role_check'
  AND conrelid = 'public.users'::regclass;
