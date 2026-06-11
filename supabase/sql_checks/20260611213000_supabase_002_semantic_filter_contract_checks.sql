-- SUPABASE-002 Phase 4.5 checks: semantic filter contract (location + portal)

-- 1) Floor Incharge source semantic completeness
SELECT
  COUNT(*) AS total_rows,
  COUNT(location) AS location_filled,
  COUNT(portal) AS portal_filled,
  COUNT(branch_label) AS branch_label_filled
FROM public.service_reception_entries;

-- 2) SA Tracker source semantic completeness
SELECT
  COUNT(*) AS total_rows,
  COUNT(location) AS location_filled,
  COUNT(portal) AS portal_filled,
  COUNT(branch_label) AS branch_label_filled
FROM public.job_card_closed_data;

-- 3) Bodyshop Repair source semantic completeness
SELECT
  COUNT(*) AS total_rows,
  COUNT(location) AS location_filled,
  COUNT(portal) AS portal_filled,
  COUNT(branch_label) AS branch_label_filled
FROM public.bodyshop_repair_cards;

-- 4) Contract guard: location should remain aligned with branch fallback for unsuffixed data
SELECT
  COUNT(*) AS mismatched_location_rows
FROM public.service_reception_entries
WHERE branch IS NOT NULL
  AND location IS NOT NULL
  AND upper(btrim(location)) <> upper(btrim(regexp_replace(branch, '(?i)\s+(EV|PV)$', '')));
-- Expected: 0 for current deterministic backfill behavior

-- 5) Contract guard: portal values constrained to EV/PV/null
SELECT
  'service_reception_entries' AS table_name,
  COUNT(*) AS invalid_portal_rows
FROM public.service_reception_entries
WHERE portal IS NOT NULL AND portal NOT IN ('EV', 'PV')
UNION ALL
SELECT 'job_card_closed_data', COUNT(*)
FROM public.job_card_closed_data
WHERE portal IS NOT NULL AND portal NOT IN ('EV', 'PV')
UNION ALL
SELECT 'bodyshop_repair_cards', COUNT(*)
FROM public.bodyshop_repair_cards
WHERE portal IS NOT NULL AND portal NOT IN ('EV', 'PV');
-- Expected: all 0

-- 6) Distribution snapshot for operational validation
SELECT
  coalesce(location, 'Unknown location') AS location,
  coalesce(portal, 'Unknown portal') AS portal,
  COUNT(*) AS row_count
FROM public.service_reception_entries
GROUP BY 1, 2
ORDER BY 3 DESC, 1, 2;

SELECT
  coalesce(location, 'Unknown location') AS location,
  coalesce(portal, 'Unknown portal') AS portal,
  COUNT(*) AS row_count
FROM public.job_card_closed_data
GROUP BY 1, 2
ORDER BY 3 DESC, 1, 2;
