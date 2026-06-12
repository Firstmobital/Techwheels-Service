-- SUPABASE-002 Phase 4.2/4.3 checks: location + portal semantics split

-- 1) New columns present in target tables
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'service_reception_entries' AND column_name IN ('location', 'portal', 'branch_label'))
    OR (table_name = 'bodyshop_repair_cards' AND column_name IN ('location', 'portal', 'branch_label'))
    OR (table_name = 'job_card_closed_data' AND column_name IN ('location', 'portal', 'branch_label'))
  )
ORDER BY table_name, column_name;

-- 2) Portal constraints present
SELECT conname, conrelid::regclass::text AS table_name
FROM pg_constraint
WHERE conname IN (
  'service_reception_entries_portal_check',
  'bodyshop_repair_cards_portal_check',
  'job_card_closed_data_portal_check'
)
ORDER BY conname;

-- 3) Invalid portal values should not exist
SELECT 'service_reception_entries' AS table_name, COUNT(*) AS invalid_portal_rows
FROM public.service_reception_entries
WHERE portal IS NOT NULL AND portal NOT IN ('EV', 'PV')
UNION ALL
SELECT 'bodyshop_repair_cards', COUNT(*)
FROM public.bodyshop_repair_cards
WHERE portal IS NOT NULL AND portal NOT IN ('EV', 'PV')
UNION ALL
SELECT 'job_card_closed_data', COUNT(*)
FROM public.job_card_closed_data
WHERE portal IS NOT NULL AND portal NOT IN ('EV', 'PV');
-- Expected: all 0

-- 4) Backfill coverage snapshot
SELECT 'service_reception_entries' AS table_name,
       COUNT(*) AS total_rows,
       COUNT(location) AS location_filled,
       COUNT(portal) AS portal_filled,
       COUNT(branch_label) AS branch_label_filled
FROM public.service_reception_entries
UNION ALL
SELECT 'bodyshop_repair_cards',
       COUNT(*),
       COUNT(location),
       COUNT(portal),
       COUNT(branch_label)
FROM public.bodyshop_repair_cards
UNION ALL
SELECT 'job_card_closed_data',
       COUNT(*),
       COUNT(location),
       COUNT(portal),
       COUNT(branch_label)
FROM public.job_card_closed_data;

-- 5) Legacy branch compatibility check (unchanged baseline shape)
SELECT table_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('service_reception_entries', 'bodyshop_repair_cards', 'job_card_closed_data')
  AND column_name = 'branch'
ORDER BY table_name;
-- Expected: 3 rows

-- 6) Sample semantics projection for sanity
SELECT branch, location, portal, branch_label
FROM public.service_reception_entries
WHERE branch IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;
