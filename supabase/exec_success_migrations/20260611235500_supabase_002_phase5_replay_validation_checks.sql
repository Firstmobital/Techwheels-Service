-- SUPABASE-002 Phase 5.1: replay validation checks (read-only)
-- Authoritative source: local_folder/backups/full_database.sql (or chunks mirror)

-- 1) Required tables exist
SELECT
  'required_tables' AS check_name,
  COUNT(*) FILTER (WHERE to_regclass(tbl) IS NOT NULL) AS present_count,
  COUNT(*) AS expected_count
FROM (
  VALUES
    ('public.bodyshop_assignments'),
    ('public.bodyshop_repair_cards'),
    ('public.service_reception_entries'),
    ('public.job_card_closed_data')
) v(tbl);
-- Expected: present_count = expected_count

-- 2) Required semantic columns exist
SELECT
  table_name,
  COUNT(*) FILTER (WHERE column_name IN ('location', 'portal', 'branch_label')) AS semantic_columns_present
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('service_reception_entries', 'bodyshop_repair_cards', 'job_card_closed_data')
GROUP BY table_name
ORDER BY table_name;
-- Expected: 3 for each table

-- 3) Required portal constraints exist
SELECT
  c.conname AS constraint_name,
  c.conrelid::regclass::text AS table_name
FROM pg_constraint c
WHERE c.conname IN (
  'service_reception_entries_portal_check',
  'bodyshop_repair_cards_portal_check',
  'job_card_closed_data_portal_check'
)
ORDER BY c.conname;
-- Expected: 3 rows

-- 4) Required location+portal indexes exist
SELECT
  indexname,
  tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('idx_sre_location_portal', 'idx_brc_location_portal', 'idx_jccd_location_portal')
ORDER BY indexname;
-- Expected: 3 rows

-- 5) Required triggers exist
SELECT
  tgname AS trigger_name,
  tgrelid::regclass::text AS table_name
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgname IN ('trg_apply_sa_business_mapping_on_reception', 'trg_bodyshop_assignments_updated_at')
ORDER BY tgname;
-- Expected: 2 rows

-- 6) Reception mapping function includes portal assignment logic
SELECT
  CASE
    WHEN pg_get_functiondef(p.oid) ILIKE '%NEW.portal :=%' THEN 'portal_assignment_present'
    ELSE 'portal_assignment_missing'
  END AS trigger_function_portal_logic
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'apply_sa_business_mapping_on_reception';
-- Expected: portal_assignment_present

-- 7) Bodyshop RLS policies required by authoritative dump
SELECT
  schemaname,
  tablename,
  policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    (tablename = 'bodyshop_assignments' AND policyname IN (
      'admin_unrestricted_all_ops_v1',
      'bodyshop_assignments_read',
      'bodyshop_assignments_insert',
      'bodyshop_assignments_update',
      'bodyshop_assignments_service_all'
    ))
    OR
    (tablename = 'bodyshop_repair_cards' AND policyname IN (
      'admin_unrestricted_all_ops_v1'
    ))
  )
ORDER BY tablename, policyname;
-- Expected: 6 rows

-- 8) Bodyshop assignment scoped policy guard (no permissive true regression)
SELECT
  tablename,
  policyname,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'bodyshop_assignments'
  AND policyname IN ('bodyshop_assignments_read', 'bodyshop_assignments_insert', 'bodyshop_assignments_update')
  AND (
    COALESCE(qual, '') ILIKE '%USING (true)%'
    OR COALESCE(with_check, '') ILIKE '%WITH CHECK (true)%'
  );
-- Expected: 0 rows

-- 9) No anon grants on bodyshop tables and sequences
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('bodyshop_assignments', 'bodyshop_repair_cards')
  AND grantee = 'anon'
UNION ALL
SELECT object_name AS table_name, grantee, privilege_type
FROM information_schema.role_usage_grants
WHERE object_schema = 'public'
  AND object_type = 'SEQUENCE'
  AND object_name IN ('bodyshop_assignments_id_seq', 'bodyshop_repair_cards_id_seq')
  AND grantee = 'anon';
-- Expected: 0 rows

-- 10) Authenticated and service_role grants exist on bodyshop tables
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('bodyshop_assignments', 'bodyshop_repair_cards')
  AND grantee IN ('authenticated', 'service_role')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;
-- Expected: rows present for authenticated and service_role on both tables
