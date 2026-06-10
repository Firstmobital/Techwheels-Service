-- Verification checks for bodyshop repair tracker migration
-- Run after executing the migration to confirm all objects exist

-- 1. Confirm all 7 tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'bodyshop_repair_cards',
    'bodyshop_stage_logs',
    'bodyshop_repair_docs',
    'bodyshop_repair_photos',
    'bodyshop_survey',
    'bodyshop_billing',
    'bodyshop_qc'
  )
ORDER BY table_name;
-- Expected: 7 rows

-- 2. Confirm module registered
SELECT module_name, display_name, is_active
FROM modules
WHERE module_name = 'bodyshop_repair';
-- Expected: 1 row, is_active = true

-- 3. Confirm all users got permission
SELECT COUNT(*) as user_count
FROM user_module_permissions
WHERE module_name = 'bodyshop_repair' AND can_access = true;
-- Expected: same count as SELECT COUNT(*) FROM users

-- 4. Confirm indexes exist
SELECT indexname FROM pg_indexes
WHERE tablename IN ('bodyshop_repair_cards','bodyshop_stage_logs','bodyshop_repair_photos')
ORDER BY indexname;
-- Expected: idx_brc_branch, idx_brc_job_card, idx_brc_status, idx_bsl_card, idx_bsl_stage, idx_brp_card_stage
