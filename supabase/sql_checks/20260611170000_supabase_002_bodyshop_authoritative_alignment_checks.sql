-- SUPABASE-002 check pack: authoritative bodyshop alignment
-- Source of truth: local_folder/backups/full_database.sql

-- 1) Bodyshop tables should exist (2-table model only)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('bodyshop_repair_cards', 'bodyshop_assignments')
ORDER BY table_name;

-- 2) Legacy decomposed tables must not be required by current contract
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'bodyshop_stage_logs',
    'bodyshop_repair_docs',
    'bodyshop_repair_photos',
    'bodyshop_survey',
    'bodyshop_billing',
    'bodyshop_qc'
  )
ORDER BY table_name;
-- Expected: 0 rows in authoritative contract

-- 3) Verify core columns of bodyshop_repair_cards
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bodyshop_repair_cards'
  AND column_name IN (
    'job_card_no',
    'branch',
    'sa_employee_code',
    'current_stage',
    'overall_status',
    'survey_status',
    'floor_status',
    'qc_status',
    'parts_entry_status',
    'delivery_status',
    'insurance_company',
    'insurance_valid_date'
  )
ORDER BY column_name;

-- 4) Verify core columns of bodyshop_assignments
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bodyshop_assignments'
  AND column_name IN (
    'job_card_number',
    'role',
    'employee_code',
    'employee_name',
    'work_status',
    'assigned_at',
    'out_ts',
    'is_active'
  )
ORDER BY column_name;

-- 5) Verify bodyshop indexes
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('bodyshop_repair_cards', 'bodyshop_assignments')
  AND indexname IN (
    'idx_brc_job_card',
    'idx_brc_branch',
    'idx_brc_status',
    'idx_brc_stage',
    'idx_bodyshop_assignments_jc',
    'idx_bodyshop_assignments_active'
  )
ORDER BY indexname;

-- 6) Verify trigger/function alignment
SELECT trigger_name
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'bodyshop_assignments'
  AND trigger_name = 'trg_bodyshop_assignments_updated_at';

SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname = 'update_bodyshop_assignments_updated_at';

-- 7) Verify module and permission contracts are canonical
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'modules'
  AND column_name IN ('name', 'label', 'route', 'is_active')
ORDER BY column_name;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_module_permissions'
  AND column_name IN ('module_id', 'can_view', 'can_modify', 'can_delete')
ORDER BY column_name;

SELECT id, name, label, route, is_active
FROM public.modules
WHERE name = 'bodyshop_repair';

-- 8) Verify RLS/policy presence for bodyshop objects
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('bodyshop_repair_cards', 'bodyshop_assignments')
ORDER BY tablename, policyname;

-- 9) Current ACL posture snapshot (to be hardened in SUPABASE-002 Phase 3)
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('bodyshop_repair_cards', 'bodyshop_assignments')
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type;
