-- Read-only verification checks for:
-- supabase/migrations/20260915170000_settings_service_parts_pricing_make.sql
-- PARTS-002 / DBL-0063
-- Execution: This file can be run in one go.

-- 1) make column present, not null, BS4/BS6 only
SELECT
  count(*) AS row_count_should_be_877,
  count(*) FILTER (WHERE make IS NULL OR btrim(make) = '') AS blank_make_should_be_0,
  count(*) FILTER (WHERE make NOT IN ('BS4', 'BS6')) AS bad_make_should_be_0,
  count(*) FILTER (WHERE make = 'BS6') AS bs6_count,
  count(*) FILTER (WHERE make = 'BS4') AS bs4_count
FROM public.settings_service_parts_pricing;

-- 2) Unique identity includes make
SELECT count(*) AS duplicate_identity_groups_should_be_0
FROM (
  SELECT lower(btrim(model)), lower(btrim(fuel)), lower(btrim(service_type)), lower(btrim(service_name)), lower(btrim(make))
  FROM public.settings_service_parts_pricing
  WHERE is_active = true
  GROUP BY 1, 2, 3, 4, 5
  HAVING count(*) > 1
) d;

-- 3) Indexes
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'settings_service_parts_pricing'
ORDER BY indexname;

-- 4) CHECK constraint
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.settings_service_parts_pricing'::regclass
  AND conname = 'settings_service_parts_pricing_make_check';
