-- Read-only verification checks for:
-- supabase/migrations/20260915180000_settings_service_parts_pricing_requirement.sql
-- PARTS-002 / DBL-0065
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) column present, not blank, only Required/Optional
SELECT
  count(*) AS row_count_should_be_877,
  count(*) FILTER (WHERE requirement IS NULL OR btrim(requirement) = '') AS blank_requirement_should_be_0,
  count(*) FILTER (WHERE requirement NOT IN ('Required', 'Optional')) AS bad_requirement_should_be_0,
  count(*) FILTER (WHERE requirement = 'Required') AS required_count,
  count(*) FILTER (WHERE requirement = 'Optional') AS optional_count
FROM public.settings_service_parts_pricing;

-- 2) Unique identity still excludes requirement (still 0 duplicate groups)
SELECT count(*) AS duplicate_identity_groups_should_be_0
FROM (
  SELECT lower(btrim(model)), lower(btrim(fuel)), lower(btrim(service_type)), lower(btrim(service_name)), lower(btrim(make))
  FROM public.settings_service_parts_pricing
  WHERE is_active = true
  GROUP BY 1, 2, 3, 4, 5
  HAVING count(*) > 1
) d;

-- 3) CHECK constraint
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.settings_service_parts_pricing'::regclass
  AND conname = 'settings_service_parts_pricing_requirement_check';
