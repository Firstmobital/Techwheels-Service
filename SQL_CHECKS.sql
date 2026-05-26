-- ========================================
-- SQL CHECKS FOR VEHICLE LOOKUP DEBUG
-- ========================================

-- 1. CHECK VEHICLES TABLE STRUCTURE & DATA
SELECT COUNT(*) as vehicle_count FROM public.vehicles;
SELECT * FROM public.vehicles LIMIT 5;

-- 2. CHECK IF RTO_CACHE TABLE EXISTS
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'rto_cache'
) as rto_cache_table_exists;

-- 3. CHECK RTO_CACHE TABLE STRUCTURE & DATA
SELECT COUNT(*) as rto_cache_count FROM public.rto_cache;
SELECT 
  id,
  registration_no,
  expires_at,
  cached_at,
  access_count
FROM public.rto_cache 
ORDER BY cached_at DESC 
LIMIT 10;

-- 4. CHECK IF SPECIFIC REGISTRATION EXISTS IN VEHICLES
-- (Replace 'DL01AB1234' with your test registration)
WITH probe AS (
  SELECT UPPER(REGEXP_REPLACE('DL01AB1234', '[^A-Za-z0-9]', '', 'g')) AS normalized_reg
)
SELECT v.*
FROM public.vehicles v
CROSS JOIN probe p
WHERE UPPER(REGEXP_REPLACE(v.reg_number, '[^A-Za-z0-9]', '', 'g')) = p.normalized_reg;

-- 5. CHECK QUERY NORMALIZATION (portable; does not require DB function)
SELECT UPPER(REGEXP_REPLACE('DL 01 AB 1234', '[^A-Za-z0-9]', '', 'g')) AS normalized;

-- 6. CHECK ALL REGISTRATIONS IN VEHICLES TABLE
SELECT DISTINCT reg_number, vin, model FROM public.vehicles 
LIMIT 20;

-- 7. CHECK RLS POLICIES ON VEHICLES TABLE
SELECT policyname, permissive, roles, qual 
FROM pg_policies 
WHERE tablename = 'vehicles';

-- 8. CHECK RLS POLICIES ON RTO_CACHE TABLE
SELECT policyname, permissive, roles, qual 
FROM pg_policies 
WHERE tablename = 'rto_cache';

-- 9. CHECK FUNCTION DEFINITIONS
SELECT 
  routines.routine_name,
  parameters.data_type
FROM information_schema.routines
LEFT JOIN information_schema.parameters 
  ON routines.specific_name = parameters.specific_name
WHERE routines.routine_schema = 'public'
  AND routines.routine_name LIKE '%normalize%'
LIMIT 20;

-- 10. CHECK EDGE FUNCTION INVOCATIONS LOG
SELECT 
  execution_id,
  function_name,
  status,
  created_at,
  updated_at
FROM _supabase_functions.executions
WHERE function_name = 'invoke-ocean025'
ORDER BY created_at DESC
LIMIT 20;
