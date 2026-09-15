-- Read-only verification checks for:
-- supabase/migrations/20260915153000_settings_service_parts_pricing.sql
-- PARTS-002 / DBL-0062
-- Execution: This file can be run in one go.

-- 1) Table exists, RLS on, GLOBAL-only check
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'settings_service_parts_pricing';

-- 2) Seed identity: 877 unique active GLOBAL rows
SELECT
  count(*) AS row_count_should_be_877,
  count(DISTINCT id) AS unique_ids_should_be_877,
  count(*) FILTER (WHERE dealer_code <> 'GLOBAL') AS non_global_should_be_0,
  count(*) FILTER (WHERE is_active IS NOT TRUE) AS inactive_should_be_0,
  count(*) FILTER (WHERE fuel NOT IN ('Petrol', 'Diesel', 'CNG', 'EV')) AS bad_fuel_should_be_0,
  count(*) FILTER (WHERE service_type = 'First Service') AS old_first_service_should_be_0,
  count(*) FILTER (WHERE service_type = 'Mini Paid Service') AS mini_paid_count,
  count(*) FILTER (
    WHERE lower(model) = 'altroz'
      AND fuel = 'CNG'
      AND service_type = 'First Free Service'
  ) AS altroz_cng_first_free_should_be_5
FROM public.settings_service_parts_pricing;

-- 3) Unique identity on active rows
SELECT count(*) AS duplicate_identity_groups_should_be_0
FROM (
  SELECT lower(btrim(model)), lower(btrim(fuel)), lower(btrim(service_type)), lower(btrim(service_name))
  FROM public.settings_service_parts_pricing
  WHERE is_active = true
  GROUP BY 1, 2, 3, 4
  HAVING count(*) > 1
) d;

-- 4) Unique index + lookup index present
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'settings_service_parts_pricing'
ORDER BY indexname;

-- 5) RLS policies
SELECT pol.polname, pol.polcmd
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'settings_service_parts_pricing'
ORDER BY pol.polname;

-- 6) Colliding service_parts_pricing must not be required
SELECT to_regclass('public.service_parts_pricing') IS NULL AS colliding_table_absent_or_ignored;
